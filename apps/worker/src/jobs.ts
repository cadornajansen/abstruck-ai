import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import { setTimeout as delay } from "node:timers/promises"
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  DOCUMENT_LIMITS,
  TEXT_LIMITS,
  extractDocument,
  extractPastedText,
  needsVisualExtraction,
} from "./document.js"
import { ProbeError } from "./process.js"
import { withScratch } from "./scratch.js"
import { processStudyJob } from "./study.js"
import {
  processAccountDataJob,
  type AccountDataFunctions,
} from "./account-data.js"
import {
  processNotificationJob,
  type NotificationFunctions,
} from "./notifications.js"
import {
  scheduleMaintenanceNotifications,
  type MaintenanceNotificationFunctions,
} from "./maintenance-notifications.js"
import { processMediaJob, type MediaFunctions } from "./media-jobs.js"
import {
  processSourceIndex,
  type SourceIndexFunctions,
} from "./source-index.js"
import {
  generateOcrPage,
  OcrGenerationError,
  ocrPageText,
  prepareOcrPage,
  renderPdfPage,
  validateOcrPage,
  type OcrPage,
  type OcrUsage,
} from "./ocr.js"

interface NormalizedPdf {
  object_key: string
  bytes: number
  sha256: string
  uploaded: boolean
}

export interface MaterialJob {
  job_id: string
  lease_token: string
  material_id: string
  owner_id: string
  object_key: string
  bytes: number
  source_type: string
  source_sha256: string | null
  input: {
    ocr?: Record<string, { state: string; output?: OcrPage }>
    normalized_pdf?: NormalizedPdf
    youtube?: { videoId: string; url: string }
  }
}

interface SourceSegment {
  ordinal: number
  text: string
  locator:
    | {
        type: "page"
        page: number
        origin?: "normalized_pdf_page"
        source_type?: "docx" | "pptx"
      }
    | { type: "paragraph"; paragraph: number }
  extraction_method: "native" | "text" | "ocr"
  extraction_status: "ready" | "partial" | "unreadable"
  unreadable_regions: string[]
}

interface WorkerDatabase {
  public: {
    Tables: {
      assets: {
        Row: {
          id: string
          owner_id: string
          material_id: string | null
          role: string
          metadata: unknown
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: NotificationFunctions &
      MaintenanceNotificationFunctions &
      AccountDataFunctions & {
        sweep_abandoned_uploads: {
          Args: { p_limit?: number }
          Returns: number
        }
        claim_material_job: {
          Args: {
            p_visibility_seconds: number
            p_include_index?: boolean
            p_index_material_ids?: string[] | null
          }
          Returns: MaterialJob[]
        }
        finish_material_job: {
          Args: {
            p_job_id: string
            p_lease_token: string
            p_segments: SourceSegment[]
          }
          Returns: boolean
        }
        fail_material_job: {
          Args: { p_job_id: string; p_lease_token: string; p_error: string }
          Returns: boolean
        }
        reserve_material_processing: {
          Args: {
            p_job_id: string
            p_lease_token: string
            p_document_units: number
            p_ocr_units: number
            p_page_limit?: number
            p_ocr_limit?: number
          }
          Returns: boolean
        }
        renew_material_job: {
          Args: { p_job_id: string; p_lease_token: string }
          Returns: boolean
        }
        begin_material_ocr_page: {
          Args: {
            p_job_id: string
            p_lease_token: string
            p_page: number
            p_input_tokens: number
            p_reserved_usd: number
          }
          Returns: {
            state: string
            admitted?: boolean
            output?: OcrPage
          } | null
        }
        checkpoint_material_ocr_page: {
          Args: {
            p_job_id: string
            p_lease_token: string
            p_page: number
            p_output: OcrPage
            p_usage: OcrUsage | null
          }
          Returns: boolean
        }
        reserve_normalized_pdf: {
          Args: {
            p_job_id: string
            p_lease_token: string
            p_bytes: number
            p_sha256: string
            p_storage_limit: number
          }
          Returns: NormalizedPdf | null
        }
        confirm_normalized_pdf: {
          Args: { p_job_id: string; p_lease_token: string; p_sha256: string }
          Returns: boolean
        }
      } & MediaFunctions &
      SourceIndexFunctions
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new ProbeError(`missing_${name.toLowerCase()}`)
  return value
}

export interface WorkerClients {
  supabase: SupabaseClient<WorkerDatabase>
  storage: S3Client
  bucket: string
}

function clients(): WorkerClients {
  const supabase = createClient<WorkerDatabase>(
    required("SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
      },
    }
  )
  const storage = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  })
  return { supabase, storage, bucket: required("R2_BUCKET") }
}

async function downloadSource(
  job: MaterialJob,
  storage: S3Client,
  bucket: string
): Promise<Buffer> {
  if (
    !["pdf", "text", "docx", "pptx"].includes(job.source_type) ||
    job.object_key !==
      `${job.owner_id}/${job.material_id}/original.${job.source_type === "text" ? "txt" : job.source_type}`
  ) {
    throw new ProbeError("unsupported_material_source")
  }
  if (
    !Number.isSafeInteger(job.bytes) ||
    job.bytes < 1 ||
    job.bytes >
      (job.source_type === "text"
        ? TEXT_LIMITS.inputBytes
        : DOCUMENT_LIMITS.inputBytes)
  ) {
    throw new ProbeError("document_size_limit")
  }
  const source = await downloadObject(
    storage,
    bucket,
    job.object_key,
    job.bytes
  )
  if (
    job.source_type === "text" &&
    (!job.source_sha256 ||
      createHash("sha256").update(source).digest("hex") !== job.source_sha256)
  )
    throw new ProbeError("text_source_hash_mismatch")
  return source
}

async function downloadObject(
  storage: S3Client,
  bucket: string,
  key: string,
  bytes: number
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > DOCUMENT_LIMITS.normalizedPdfBytes
  )
    throw new ProbeError("document_size_limit")
  const signal = AbortSignal.timeout(30_000)
  const response = await storage.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: signal }
  )
  const body = response.Body
  if (!(body instanceof Readable))
    throw new ProbeError("source_body_unavailable")
  const cancel = (): void => {
    body.destroy(new Error("source_download_timeout"))
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    if (response.ContentLength !== bytes)
      throw new ProbeError("source_size_mismatch")
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of body as AsyncIterable<Buffer>) {
      length += chunk.length
      if (length > bytes) throw new ProbeError("source_size_mismatch")
      chunks.push(chunk)
    }
    if (length !== bytes) throw new ProbeError("source_size_mismatch")
    const source = Buffer.concat(chunks, length)
    return source
  } finally {
    signal.removeEventListener("abort", cancel)
    body.destroy()
  }
}

async function readNormalizedPdf(
  worker: WorkerClients,
  job: MaterialJob,
  asset: NormalizedPdf
): Promise<Buffer> {
  if (
    !new RegExp(
      `^${job.owner_id}/${job.material_id}/normalized-v[1-9][0-9]*\\.pdf$`
    ).test(asset.object_key)
  )
    throw new ProbeError("normalized_pdf_key_mismatch")
  const pdf = await downloadObject(
    worker.storage,
    worker.bucket,
    asset.object_key,
    asset.bytes
  )
  if (createHash("sha256").update(pdf).digest("hex") !== asset.sha256)
    throw new ProbeError("normalized_pdf_hash_mismatch")
  return pdf
}

async function officePdf(
  worker: WorkerClients,
  job: MaterialJob,
  scratch: string
): Promise<Buffer> {
  const cached = job.input.normalized_pdf
  if (cached) {
    try {
      const pdf = await readNormalizedPdf(worker, job, cached)
      if (!cached.uploaded) {
        const confirmed = await worker.supabase.rpc("confirm_normalized_pdf", {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
          p_sha256: cached.sha256,
        })
        if (confirmed.error || !confirmed.data)
          throw new Error("normalized_pdf_checkpoint_unavailable")
      }
      return pdf
    } catch (error) {
      if (
        cached.uploaded ||
        !error ||
        typeof error !== "object" ||
        !("$metadata" in error) ||
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404
      )
        throw error
    }
  }
  const source = await downloadSource(job, worker.storage, worker.bucket)
  const sourcePath = join(scratch, `source.${job.source_type}`)
  await writeFile(sourcePath, source, { flag: "wx" })
  const extracted = await extractDocument(sourcePath)
  if (extracted.evidence.status === "failed")
    throw new ProbeError("document_extraction_failed")
  let pdf = extracted.normalizedPdf
  const sha256 = createHash("sha256").update(pdf).digest("hex")
  const reserved = await worker.supabase.rpc("reserve_normalized_pdf", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_bytes: pdf.length,
    p_sha256: sha256,
    p_storage_limit: 100_000_000,
  })
  if (reserved.error)
    throw new ProbeError(
      reserved.error.message.includes("storage_quota_exceeded")
        ? "storage_quota_exceeded"
        : "normalized_pdf_reservation_failed"
    )
  if (!reserved.data) throw new Error("material_lease_unavailable")
  const asset = reserved.data
  if (asset.sha256 !== sha256 || asset.uploaded)
    pdf = await readNormalizedPdf(worker, job, asset)
  else {
    try {
      await worker.storage.send(
        new PutObjectCommand({
          Bucket: worker.bucket,
          Key: asset.object_key,
          Body: pdf,
          ContentType: "application/pdf",
          ContentLength: pdf.length,
          Metadata: { sha256 },
          IfNoneMatch: "*",
        }),
        { abortSignal: AbortSignal.timeout(30_000) }
      )
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("$metadata" in error) ||
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 412
      )
        throw error
      pdf = await readNormalizedPdf(worker, job, asset)
    }
  }
  const confirmed = await worker.supabase.rpc("confirm_normalized_pdf", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_sha256: asset.sha256,
  })
  if (confirmed.error || !confirmed.data)
    throw new Error("normalized_pdf_checkpoint_unavailable")
  return pdf
}

function unreadablePage(page: number, reason: string): OcrPage {
  return {
    pageNumber: page,
    status: "unreadable",
    text: "",
    tables: [],
    formulas: [],
    unreadableRegions: [reason],
  }
}

async function saveOcrPage(
  worker: WorkerClients,
  job: MaterialJob,
  page: OcrPage,
  usage: OcrUsage | null
): Promise<OcrPage> {
  const checkpoint = await worker.supabase.rpc("checkpoint_material_ocr_page", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_page: page.pageNumber,
    p_output: page,
    p_usage: usage,
  })
  if (checkpoint.error || !checkpoint.data)
    throw new Error("ocr_checkpoint_unavailable")
  return page
}

async function extractOcrPage(
  worker: WorkerClients,
  job: MaterialJob,
  path: string,
  page: number
): Promise<OcrPage> {
  const cached = job.input.ocr?.[String(page)]
  if (cached?.output) return validateOcrPage(cached.output, page)
  if (cached)
    return saveOcrPage(
      worker,
      job,
      unreadablePage(
        page,
        "OCR was interrupted after submission. This page was not submitted again; replace the material to try a new scan."
      ),
      null
    )
  const renewed = await worker.supabase.rpc("renew_material_job", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
  })
  if (renewed.error || !renewed.data)
    throw new Error("material_lease_unavailable")
  let prepared: Awaited<ReturnType<typeof prepareOcrPage>>
  try {
    prepared = await prepareOcrPage(await renderPdfPage(path, page), page)
  } catch {
    return unreadablePage(
      page,
      "This page could not be read within the scan quality or processing limits. Try a clearer scan."
    )
  }
  const admitted = await worker.supabase.rpc("begin_material_ocr_page", {
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_page: page,
    p_input_tokens: prepared.reservedInputTokens,
    p_reserved_usd: prepared.reservedUsd,
  })
  if (admitted.error)
    return unreadablePage(
      page,
      "OCR processing allowance is unavailable for this page. Try again later or use a text-based PDF."
    )
  if (!admitted.data) throw new Error("material_lease_unavailable")
  if (!admitted.data.admitted) {
    if (admitted.data.output) return validateOcrPage(admitted.data.output, page)
    return saveOcrPage(
      worker,
      job,
      unreadablePage(
        page,
        "The previous OCR submission could not be confirmed. It was not submitted again."
      ),
      null
    )
  }
  let output: OcrPage
  let usage: OcrUsage | null
  try {
    const result = await generateOcrPage(prepared, page)
    output = result.page
    usage = result.usage
  } catch (error) {
    usage = error instanceof OcrGenerationError ? (error.usage ?? null) : null
    output = unreadablePage(
      page,
      usage
        ? "OCR did not return a complete readable extraction. Try a clearer scan."
        : "The OCR result could not be confirmed. This page was not submitted again."
    )
  }
  return saveOcrPage(worker, job, output, usage)
}

async function extractMaterial(
  worker: WorkerClients,
  job: MaterialJob
): Promise<SourceSegment[]> {
  return withScratch(async (scratch) => {
    const office = job.source_type === "docx" || job.source_type === "pptx"
    const source = office
      ? await officePdf(worker, job, scratch)
      : await downloadSource(job, worker.storage, worker.bucket)
    const path = join(scratch, "source.pdf")
    const pages =
      job.source_type === "text"
        ? extractPastedText(source)
        : await (async () => {
            await writeFile(path, source, { flag: "wx" })
            const extracted = await extractDocument(path)
            if (extracted.evidence.status === "failed")
              throw new ProbeError("document_extraction_failed")
            return extracted.pages
          })()
    // Provisional equivalent-page admission: 2,000 UTF-8 bytes per unit, not an exact token count.
    const documentUnits =
      job.source_type === "text"
        ? Math.ceil(job.bytes / TEXT_LIMITS.bytesPerEquivalentPage)
        : pages.length
    const reserved = await worker.supabase.rpc("reserve_material_processing", {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_document_units: documentUnits,
      p_ocr_units:
        job.source_type !== "text"
          ? pages.filter(needsVisualExtraction).length
          : 0,
    })
    if (reserved.error) {
      const reason = [
        "document_page_quota_exceeded",
        "ocr_page_quota_exceeded",
      ].find((code) => reserved.error.message.includes(code))
      throw new ProbeError(reason ?? "import_reservation_unavailable")
    }
    if (!reserved.data) throw new Error("material_lease_unavailable")
    const segments: SourceSegment[] = []
    for (const [index, text] of pages.entries()) {
      const number = index + 1
      const locator: SourceSegment["locator"] =
        job.source_type === "text"
          ? { type: "paragraph", paragraph: number }
          : office
            ? {
                type: "page",
                page: number,
                origin: "normalized_pdf_page",
                source_type: job.source_type as "docx" | "pptx",
              }
            : { type: "page", page: number }
      if (job.source_type !== "text" && needsVisualExtraction(text)) {
        const output = await extractOcrPage(worker, job, path, number)
        segments.push({
          ordinal: number,
          locator,
          text: ocrPageText(output),
          extraction_method: "ocr",
          extraction_status: output.status,
          unreadable_regions: output.unreadableRegions,
        })
      } else {
        segments.push({
          ordinal: number,
          text,
          locator,
          extraction_method: job.source_type === "text" ? "text" : "native",
          extraction_status: "ready",
          unreadable_regions: [],
        })
      }
    }
    return segments
  })
}

async function processNext(worker: WorkerClients): Promise<boolean> {
  const claimed = await worker.supabase.rpc("claim_material_job", {
    p_visibility_seconds: 600,
    p_include_index: process.env.OPENAI_EMBEDDINGS_ENABLED === "true",
    p_index_material_ids:
      process.env.ABSTRUCK_INDEX_MATERIAL_IDS?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? null,
  })
  if (claimed.error) throw new ProbeError("queue_claim_failed")
  const job = claimed.data?.[0]
  if (!job) return false

  try {
    if (job.source_type === "index_material") {
      await processSourceIndex(worker, job)
      return true
    }
    if (["audio", "video", "youtube"].includes(job.source_type)) {
      await processMediaJob(worker, job)
      return true
    }
    const segments = await extractMaterial(worker, job)
    const finished = await worker.supabase.rpc("finish_material_job", {
      p_job_id: job.job_id,
      p_lease_token: job.lease_token,
      p_segments: segments,
    })
    if (finished.error) throw new Error("queue_completion_unavailable")
    console.log(
      JSON.stringify({
        event: finished.data ? "material_processed" : "lease_expired",
        materialId: job.material_id,
        segments: segments.length,
      })
    )
  } catch (error) {
    if (error instanceof ProbeError) {
      const failed = await worker.supabase.rpc("fail_material_job", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_error: error.code.slice(0, 80),
      })
      console.log(
        JSON.stringify({
          event: failed.error
            ? "retry_pending"
            : failed.data
              ? "material_failed"
              : "lease_expired",
          materialId: job.material_id,
          reason: error.code,
        })
      )
    } else {
      // Keep the queue message unacknowledged on network/commit uncertainty.
      console.log(
        JSON.stringify({ event: "retry_pending", materialId: job.material_id })
      )
    }
  }
  return true
}

async function main(): Promise<void> {
  const [mode = "--once", ...extra] = process.argv.slice(2)
  if (!["--once", "--watch"].includes(mode) || extra.length > 0)
    throw new ProbeError("usage_jobs_once_or_watch")
  const worker = clients()
  const stop = new AbortController()
  process.once("SIGINT", () => stop.abort())
  process.once("SIGTERM", () => stop.abort())
  let lastMaintenance = 0
  try {
    do {
      let processed = false
      try {
        if (Date.now() - lastMaintenance >= 300_000) {
          lastMaintenance = Date.now()
          const cleanup = await worker.supabase.rpc("sweep_abandoned_uploads", {
            p_limit: 10,
          })
          if (cleanup.error)
            console.error(
              JSON.stringify({ event: "upload_cleanup_schedule_failed" })
            )
          else if (cleanup.data)
            console.log(
              JSON.stringify({
                event: "abandoned_uploads_queued",
                count: cleanup.data,
              })
            )
          await scheduleMaintenanceNotifications(worker)
        }
        processed = await processAccountDataJob(worker)
        const notified = await processNotificationJob(worker)
        processed = processed || notified
        const imported = await processNext(worker)
        processed = processed || imported
        const generated = await processStudyJob(worker)
        processed = processed || generated
      } catch (error) {
        if (mode === "--once") throw error
        console.error(
          JSON.stringify({ event: "queue_unavailable", retryInSeconds: 5 })
        )
        await delay(5000, undefined, { signal: stop.signal }).catch(() => {})
        continue
      }
      if (mode === "--once") {
        if (!processed) console.log(JSON.stringify({ event: "queue_idle" }))
        break
      }
      if (!processed)
        await delay(2000, undefined, { signal: stop.signal }).catch(() => {})
    } while (!stop.signal.aborted)
  } finally {
    worker.storage.destroy()
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "worker_failed",
      reason:
        error instanceof ProbeError ? error.code : "unexpected_worker_failure",
    })
  )
  process.exitCode = 1
})
