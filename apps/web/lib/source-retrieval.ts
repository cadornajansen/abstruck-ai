import "server-only"

import OpenAI from "openai"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AnswerError, type SourcePassage } from "@/lib/openai/grounded-answer"

export const QUERY_EMBEDDING_MAX_COST_USD = 8000 * 0.00000002

export function semanticRetrievalEnabled(): boolean {
  return process.env.OPENAI_EMBEDDINGS_ENABLED === "true"
}

export async function retrieveSourcePassages(
  question: string,
  materialIds: string[],
  embedding?: number[],
  requestId?: string
): Promise<{ sources: SourcePassage[]; semanticReady: boolean }> {
  const db = await createClient()
  const result = await db.rpc("hybrid_source_search", {
    p_material_ids: materialIds,
    p_query: question,
    p_embedding: embedding ? JSON.stringify(embedding) : undefined,
    p_request_id: requestId,
  })
  if (result.error)
    throw new AnswerError(
      "Your sources could not be searched. Please try again."
    )
  return {
    sources: result.data.map((source) => {
      const locator = source.locator as { type?: string; start_ms?: number }
      return {
        id: source.id,
        materialId: source.material_id,
        title: source.title,
        page: source.page,
        text: source.text,
        ...(locator.type === "time" && typeof locator.start_ms === "number"
          ? { timeMs: locator.start_ms }
          : {}),
      }
    }),
    semanticReady:
      result.data.length > 0 &&
      result.data.every((source) => source.semantic_ready),
  }
}

export async function embedRetrievalQuery(
  ownerId: string,
  requestId: string,
  signal: AbortSignal
): Promise<number[]> {
  const admin = createAdminClient()
  const admitted = await admin.rpc("begin_chat_retrieval", {
    p_owner_id: ownerId,
    p_request_id: requestId,
  })
  const batch = admitted.data as {
    admitted?: boolean
    question?: string
    inputBytes?: number
  } | null
  if (
    admitted.error ||
    !batch?.admitted ||
    typeof batch.question !== "string" ||
    !batch.inputBytes
  )
    throw new AnswerError(
      "This question’s source search is already submitted. Refresh before retrying."
    )
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 20_000,
  })
  let receiptSaved = false
  try {
    const { data, response } = await client.embeddings
      .create(
        {
          model: "text-embedding-3-small",
          dimensions: 512,
          encoding_format: "float",
          input: batch.question,
        },
        { signal }
      )
      .withResponse()
    const tokens = data.usage.total_tokens
    if (
      data.model !== "text-embedding-3-small" ||
      !Number.isSafeInteger(tokens) ||
      tokens <= 0 ||
      tokens > batch.inputBytes ||
      data.usage.prompt_tokens !== tokens
    )
      throw new Error("embedding_usage_invalid")
    const saved = await admin.rpc("checkpoint_chat_retrieval", {
      p_owner_id: ownerId,
      p_request_id: requestId,
      p_usage: {
        id: response.headers.get("x-request-id"),
        model: data.model,
        input_tokens: tokens,
        output_tokens: 0,
        cost_usd: Number((tokens * 0.00000002).toFixed(10)),
      },
    })
    if (saved.error) throw new Error("embedding_checkpoint_unavailable")
    receiptSaved = true
    if (!saved.data || signal.aborted)
      throw new AnswerError("Reply stopped.", undefined, false, "", true)
    const embedding = data.data[0]?.embedding
    if (
      data.data.length !== 1 ||
      !embedding ||
      embedding.length !== 512 ||
      !embedding.every(Number.isFinite) ||
      !embedding.some((value) => value !== 0)
    )
      throw new Error("embedding_vector_invalid")
    return embedding
  } catch (cause) {
    if (cause instanceof AnswerError) throw cause
    const rejected =
      cause instanceof OpenAI.APIError &&
      cause.status !== undefined &&
      cause.status < 500
    throw new AnswerError(
      "Source search could not finish. Your question is saved; refresh before retrying.",
      undefined,
      !receiptSaved && !rejected
    )
  }
}
