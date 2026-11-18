import type { MaterialJob, WorkerClients } from "./jobs.js"

interface IndexSegment {
  id: string
  text: string
  hash: string
}
interface IndexBatch {
  done: boolean
  batchId: string
  segments: IndexSegment[]
  inputBytes: number
  reservedUsd: number
}
interface EmbeddingUsage {
  id: string | null
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
}
export type SourceIndexFunctions = {
  begin_source_index_batch: {
    Args: { p_job_id: string; p_lease_token: string; p_max_cost_usd: number }
    Returns: IndexBatch | null
  }
  checkpoint_source_index_batch: {
    Args: {
      p_job_id: string
      p_lease_token: string
      p_batch_id: string
      p_vectors: { id: string; embedding: number[] }[]
      p_usage: EmbeddingUsage
    }
    Returns: boolean
  }
  fail_source_index: {
    Args: {
      p_job_id: string
      p_lease_token: string
      p_reason: string
      p_uncertain: boolean
      p_usage?: EmbeddingUsage
    }
    Returns: boolean
  }
}

let sessionReservedUsd = 0

export async function processSourceIndex(
  worker: WorkerClients,
  job: MaterialJob
): Promise<void> {
  let usage: EmbeddingUsage | undefined
  let dispatched = false
  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error("embedding_not_configured")
    for (;;) {
      usage = undefined
      dispatched = false
      const renewed = await worker.supabase.rpc("renew_material_job", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
      })
      if (renewed.error || !renewed.data) return
      const configured = Number(
        process.env.ABSTRUCK_EMBEDDING_EVAL_MAX_USD ?? "Infinity"
      )
      const remaining = Math.min(0.05, configured - sessionReservedUsd)
      if (!Number.isFinite(remaining) || remaining <= 0)
        throw new Error("embedding_session_cost_limit")
      const admitted = await worker.supabase.rpc("begin_source_index_batch", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_max_cost_usd: remaining,
      })
      if (admitted.error) throw new Error("embedding_admission_failed")
      const batch = admitted.data
      if (!batch) return
      if (batch.done) {
        console.log(
          JSON.stringify({
            event: "material_indexed",
            materialId: job.material_id,
          })
        )
        return
      }
      if (
        !Array.isArray(batch.segments) ||
        batch.segments.length < 1 ||
        batch.segments.length > 16 ||
        batch.segments.some(
          (segment) =>
            !segment.text.trim() || Buffer.byteLength(segment.text) > 8000
        ) ||
        batch.reservedUsd > remaining
      )
        throw new Error("embedding_batch_invalid")
      sessionReservedUsd += batch.reservedUsd
      dispatched = true
      // Native fetch deliberately has no automatic provider retry. A persisted
      // submitted batch without a receipt is held for reconciliation.
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-Client-Request-Id": batch.batchId,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          dimensions: 512,
          encoding_format: "float",
          input: batch.segments.map((segment) => segment.text),
        }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) {
        dispatched = response.status >= 500
        throw new Error("embedding_provider_rejected")
      }
      const result = (await response.json()) as {
        model?: string
        usage?: { prompt_tokens?: number; total_tokens?: number }
        data?: { index: number; embedding: number[] }[]
      }
      const tokens = result.usage?.total_tokens
      if (
        result.model !== "text-embedding-3-small" ||
        !Number.isSafeInteger(tokens) ||
        !tokens ||
        tokens > batch.inputBytes ||
        result.usage?.prompt_tokens !== tokens
      )
        throw new Error("embedding_usage_unconfirmed")
      usage = {
        id: response.headers.get("x-request-id"),
        model: result.model,
        input_tokens: tokens,
        output_tokens: 0,
        cost_usd: Number((tokens * 0.00000002).toFixed(10)),
      }
      if (
        !Array.isArray(result.data) ||
        result.data.length !== batch.segments.length ||
        new Set(result.data.map((entry) => entry.index)).size !==
          batch.segments.length ||
        result.data.some(
          (entry) =>
            !Number.isInteger(entry.index) ||
            entry.index < 0 ||
            entry.index >= batch.segments.length ||
            !Array.isArray(entry.embedding) ||
            entry.embedding.length !== 512 ||
            !entry.embedding.every(Number.isFinite) ||
            !entry.embedding.some((value) => value !== 0)
        )
      )
        throw new Error("embedding_vector_invalid")
      const saved = await worker.supabase.rpc("checkpoint_source_index_batch", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_batch_id: batch.batchId,
        p_usage: usage,
        p_vectors: result.data.map((entry) => ({
          id: batch.segments[entry.index]!.id,
          embedding: entry.embedding,
        })),
      })
      if (saved.error) throw new Error("embedding_checkpoint_unavailable")
      if (!saved.data) return
      console.log(
        JSON.stringify({
          event: "source_index_batch_saved",
          materialId: job.material_id,
          segments: result.data.length,
          inputTokens: tokens,
          costUsd: usage.cost_usd,
        })
      )
    }
  } catch (cause) {
    const reason =
      cause instanceof Error ? cause.message : "embedding_interrupted"
    const failed = await worker.supabase.rpc("fail_source_index", {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_reason: reason,
      p_uncertain: dispatched && !usage,
      ...(usage ? { p_usage: usage } : {}),
    })
    console.log(
      JSON.stringify({
        event: failed.error
          ? "index_reconciliation_pending"
          : "material_index_unavailable",
        materialId: job.material_id,
        reason,
      })
    )
  }
}
