import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { MaterialJob, WorkerClients } from "./jobs.js"
import { withScratch } from "./scratch.js"
import { ProbeError } from "./process.js"
import { acquireYouTubeAudio, type YouTubeMetadata } from "./youtube.js"
import {
  AssemblyAIRequestError,
  getTranscript,
  inspectMedia,
  MEDIA_LIMITS,
  normalizeAudio,
  reconcileTranscript,
  submitTranscript,
  transcriptOutput,
  type MediaInfo,
  type TranscriptOutput,
} from "./media.js"

interface AudioAsset {
  object_key: string
  bytes: number
  sha256: string
  uploaded: boolean
}
interface MediaRun {
  job_id: string
  state: string
  duration_ms: number
  source_sha256: string
  source_info: MediaInfo
  audio_asset: AudioAsset | null
  provider_id: string | null
  provider_audio_url: string | null
  submitted_at: string | null
  poll_count: number
  output: TranscriptOutput | null
  rate_usd_per_hour: number
  request_version: string
}
type LeaseArgs = {
  p_job_id: string
  p_lease_token: string
}
export type MediaFunctions = {
  checkpoint_youtube_metadata: {
    Args: LeaseArgs & { p_metadata: YouTubeMetadata }
    Returns: boolean
  }
  get_media_run: { Args: LeaseArgs; Returns: MediaRun | null }
  reserve_media_processing: {
    Args: LeaseArgs & {
      p_duration_ms: number
      p_source_sha256: string
      p_source_info: MediaInfo
    }
    Returns: MediaRun | null
  }
  reserve_normalized_audio: {
    Args: LeaseArgs & { p_bytes: number; p_sha256: string }
    Returns: AudioAsset | null
  }
  confirm_normalized_audio: {
    Args: LeaseArgs & { p_sha256: string }
    Returns: boolean
  }
  begin_media_transcription: {
    Args: LeaseArgs & { p_audio_url: string }
    Returns: (MediaRun & { admitted?: boolean }) | null
  }
  wait_media_transcription: {
    Args: LeaseArgs & { p_provider_id: string | null }
    Returns: boolean
  }
  checkpoint_media_output: {
    Args: LeaseArgs & { p_output: TranscriptOutput }
    Returns: boolean
  }
  finish_media_job: { Args: LeaseArgs; Returns: boolean }
  fail_media_job: {
    Args: LeaseArgs & {
      p_error: string
      p_uncertain: boolean
      p_cost_usd?: number | null
    }
    Returns: boolean
  }
}
const lease = (job: MaterialJob): LeaseArgs => ({
  p_job_id: job.job_id,
  p_lease_token: job.lease_token,
})
const hash = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex")

async function readObject(
  worker: WorkerClients,
  key: string,
  bytes: number,
  expectedHash?: string
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > MEDIA_LIMITS.audioBytes
  )
    throw new ProbeError("media_size_limit")
  const signal = AbortSignal.timeout(30_000)
  const response = await worker.storage.send(
    new GetObjectCommand({ Bucket: worker.bucket, Key: key }),
    { abortSignal: signal }
  )
  if (!(response.Body instanceof Readable))
    throw new ProbeError("media_body_unavailable")
  const body = response.Body
  const cancel = (): void => {
    body.destroy(new Error("media_download_timeout"))
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    if (response.ContentLength !== bytes)
      throw new ProbeError("media_size_mismatch")
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of body as AsyncIterable<Buffer>) {
      size += chunk.length
      if (size > bytes) throw new ProbeError("media_size_mismatch")
      chunks.push(chunk)
    }
    if (size !== bytes) throw new ProbeError("media_size_mismatch")
    const data = Buffer.concat(chunks, size)
    if (expectedHash && hash(data) !== expectedHash)
      throw new ProbeError("media_hash_mismatch")
    return data
  } finally {
    signal.removeEventListener("abort", cancel)
    body.destroy()
  }
}

function mediaExtension(job: MaterialJob): string {
  const extension = job.object_key.split(".").at(-1) ?? ""
  const kind = ["mp4", "mov", "webm"].includes(extension) ? "video" : "audio"
  if (
    !["mp3", "m4a", "wav", "ogg", "mp4", "mov", "webm"].includes(extension) ||
    kind !== job.source_type ||
    job.object_key !==
      `${job.owner_id}/${job.material_id}/original.${extension}` ||
    job.bytes > MEDIA_LIMITS.inputBytes
  )
    throw new ProbeError("unsupported_media_source")
  return extension
}

async function readAudio(
  worker: WorkerClients,
  job: MaterialJob,
  asset: AudioAsset
): Promise<Buffer> {
  if (asset.object_key !== `${job.owner_id}/${job.material_id}/audio-v1.mp3`)
    throw new ProbeError("invalid_audio_asset")
  return readObject(worker, asset.object_key, asset.bytes, asset.sha256)
}

async function confirmAudio(
  worker: WorkerClients,
  job: MaterialJob,
  asset: AudioAsset
): Promise<void> {
  const result = await worker.supabase.rpc("confirm_normalized_audio", {
    ...lease(job),
    p_sha256: asset.sha256,
  })
  if (result.error || !result.data)
    throw new Error("audio_checkpoint_unavailable")
}

async function saveAudio(
  worker: WorkerClients,
  job: MaterialJob,
  audio: Buffer
): Promise<AudioAsset> {
  const sha256 = hash(audio)
  const reserved = await worker.supabase.rpc("reserve_normalized_audio", {
    ...lease(job),
    p_bytes: audio.length,
    p_sha256: sha256,
  })
  if (reserved.error)
    throw new ProbeError(
      reserved.error.message.includes("storage_quota_exceeded")
        ? "storage_quota_exceeded"
        : "audio_reservation_failed"
    )
  if (!reserved.data) throw new Error("material_lease_unavailable")
  const asset = reserved.data
  if (asset.uploaded || asset.sha256 !== sha256)
    await readAudio(worker, job, asset)
  else {
    try {
      await worker.storage.send(
        new PutObjectCommand({
          Bucket: worker.bucket,
          Key: asset.object_key,
          Body: audio,
          ContentLength: audio.length,
          ContentType: "audio/mpeg",
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
      await readAudio(worker, job, asset)
    }
  }
  await confirmAudio(worker, job, asset)
  return { ...asset, uploaded: true }
}

async function reserveMedia(
  worker: WorkerClients,
  job: MaterialJob,
  durationMs: number,
  sourceHash: string,
  info: MediaInfo
): Promise<MediaRun> {
  const reserved = await worker.supabase.rpc("reserve_media_processing", {
    ...lease(job),
    p_duration_ms: durationMs,
    p_source_sha256: sourceHash,
    p_source_info: info,
  })
  if (reserved.error) {
    const reason = [
      "transcription_quota_exceeded",
      "transcription_daily_cost_limit",
      "transcription_owner_cost_limit",
      "youtube_import_cost_limit",
    ].find((code) => reserved.error.message.includes(code))
    throw new ProbeError(reason ?? "media_reservation_failed")
  }
  if (!reserved.data) throw new Error("material_lease_unavailable")
  return reserved.data
}

async function prepareMedia(
  worker: WorkerClients,
  job: MaterialJob,
  run: MediaRun | null
): Promise<MediaRun> {
  if (run?.audio_asset) {
    try {
      await readAudio(worker, job, run.audio_asset)
      if (!run.audio_asset.uploaded)
        await confirmAudio(worker, job, run.audio_asset)
      return reserveMedia(
        worker,
        job,
        run.duration_ms,
        run.source_sha256,
        run.source_info
      )
    } catch (error) {
      if (
        run.audio_asset.uploaded ||
        !error ||
        typeof error !== "object" ||
        !("$metadata" in error) ||
        (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404
      )
        throw error
    }
  }
  return withScratch(async (scratch) => {
    if (job.source_type === "youtube") {
      const acquired = await acquireYouTubeAudio(
        job.input.youtube?.url ?? "",
        scratch,
        async (metadata) => {
          const saved = await worker.supabase.rpc(
            "checkpoint_youtube_metadata",
            {
              ...lease(job),
              p_metadata: metadata,
            }
          )
          if (saved.error) {
            const code = [
              "youtube_import_cost_limit",
              "transcription_quota_exceeded",
            ].find((value) => saved.error!.message.includes(value))
            if (code) throw new ProbeError(code)
          }
          if (saved.error || !saved.data)
            throw new Error("youtube_metadata_checkpoint_unavailable")
        }
      )
      const info = await inspectMedia(
        acquired.path,
        acquired.metadata.extension,
        scratch,
        "audio"
      )
      if (
        Math.abs(info.durationMs - acquired.metadata.durationSeconds * 1000) >
        1000
      )
        throw new ProbeError("youtube_audio_duration_mismatch")
      const normalized = await normalizeAudio(
        acquired.path,
        scratch,
        info.durationMs
      )
      const reserved = await reserveMedia(
        worker,
        job,
        normalized.durationMs,
        acquired.sha256,
        info
      )
      const asset = await saveAudio(worker, job, normalized.audio)
      return { ...reserved, audio_asset: asset }
    }
    const extension = mediaExtension(job)
    const source = await readObject(worker, job.object_key, job.bytes)
    const path = join(scratch, `source.${extension}`)
    await writeFile(path, source, { flag: "wx" })
    const info = await inspectMedia(path, extension, scratch)
    const normalized = await normalizeAudio(path, scratch, info.durationMs)
    const reserved = await reserveMedia(
      worker,
      job,
      normalized.durationMs,
      hash(source),
      info
    )
    const asset = await saveAudio(worker, job, normalized.audio)
    return { ...reserved, audio_asset: asset }
  })
}

async function waitForProvider(
  worker: WorkerClients,
  job: MaterialJob,
  id: string | null
): Promise<void> {
  const waiting = await worker.supabase.rpc("wait_media_transcription", {
    ...lease(job),
    p_provider_id: id,
  })
  if (waiting.error || !waiting.data)
    throw new Error("transcript_wait_checkpoint_unavailable")
}

async function failMedia(
  worker: WorkerClients,
  job: MaterialJob,
  code: string,
  uncertain: boolean,
  cost: number | null = null
): Promise<void> {
  const failed = await worker.supabase.rpc("fail_media_job", {
    ...lease(job),
    p_error: code,
    p_uncertain: uncertain,
    p_cost_usd: cost,
  })
  if (failed.error || !failed.data)
    throw new Error("transcript_failure_checkpoint_unavailable")
}

async function finishMedia(
  worker: WorkerClients,
  job: MaterialJob
): Promise<void> {
  const finished = await worker.supabase.rpc("finish_media_job", lease(job))
  if (finished.error || !finished.data)
    throw new Error("transcript_publication_unavailable")
  console.log(
    JSON.stringify({ event: "media_processed", materialId: job.material_id })
  )
}

async function reconcileMedia(
  worker: WorkerClients,
  job: MaterialJob,
  run: MediaRun
): Promise<void> {
  if (run.output) return finishMedia(worker, job)
  if (!run.provider_audio_url || !run.submitted_at)
    throw new ProbeError("transcript_source_identity_missing")
  if (
    run.poll_count >= MEDIA_LIMITS.maxPolls ||
    (!run.provider_id && Date.now() - Date.parse(run.submitted_at) > 3_600_000)
  )
    return failMedia(worker, job, "transcript_reconciliation_required", true)
  let id = run.provider_id
  let result: Record<string, unknown>
  try {
    id ??= await reconcileTranscript(run.provider_audio_url)
    if (!id) return waitForProvider(worker, job, null)
    result = await getTranscript(id)
  } catch {
    return waitForProvider(worker, job, id)
  }
  if (result.id !== id || result.audio_url !== run.provider_audio_url)
    return failMedia(worker, job, "transcript_identity_mismatch", true)
  if (result.status === "queued" || result.status === "processing")
    return waitForProvider(worker, job, id)
  const cost =
    typeof result.audio_duration === "number" &&
    result.audio_duration >= 0 &&
    result.audio_duration <= Math.ceil(run.duration_ms / 1000)
      ? Number(
          ((result.audio_duration * run.rate_usd_per_hour) / 3600).toFixed(10)
        )
      : null
  if (result.status === "error")
    return failMedia(worker, job, "transcript_provider_failed", false, cost)
  let output: TranscriptOutput
  try {
    output = transcriptOutput(
      result,
      run.duration_ms,
      run.provider_audio_url,
      run.rate_usd_per_hour
    )
  } catch (error) {
    return failMedia(
      worker,
      job,
      error instanceof ProbeError ? error.code : "transcript_validation_failed",
      false,
      cost
    )
  }
  // An ID recovered by a read-only list must be bound before saving its output.
  if (!run.provider_id) {
    await waitForProvider(worker, job, id)
    return
  }
  const saved = await worker.supabase.rpc("checkpoint_media_output", {
    ...lease(job),
    p_output: output,
  })
  if (saved.error || !saved.data)
    throw new Error("transcript_output_checkpoint_unavailable")
  await finishMedia(worker, job)
}

export async function processMediaJob(
  worker: WorkerClients,
  job: MaterialJob
): Promise<void> {
  const current = await worker.supabase.rpc("get_media_run", lease(job))
  if (current.error) throw new Error("media_run_unavailable")
  if (current.data?.submitted_at)
    return reconcileMedia(worker, job, current.data)
  try {
    const run = await prepareMedia(worker, job, current.data)
    if (
      !process.env.ASSEMBLYAI_API_KEY ||
      !process.env.ASSEMBLYAI_WEBHOOK_URL ||
      !process.env.ASSEMBLYAI_WEBHOOK_SECRET
    )
      throw new ProbeError("assemblyai_configuration_missing")
    if (!run.audio_asset) throw new ProbeError("normalized_audio_missing")
    let language: "auto" | "en" | "tl" = "auto"
    if (job.source_type !== "youtube") {
      const asset = await worker.supabase
        .from("assets")
        .select("metadata")
        .eq("material_id", job.material_id)
        .eq("owner_id", job.owner_id)
        .eq("role", "original")
        .maybeSingle()
      if (asset.error || !asset.data)
        throw new Error("media_language_unavailable")
      const metadata = asset.data.metadata
      const value =
        metadata &&
        typeof metadata === "object" &&
        "transcriptionLanguage" in metadata
          ? metadata.transcriptionLanguage
          : "auto"
      if (value !== "auto" && value !== "en" && value !== "tl")
        throw new ProbeError("invalid_transcription_language")
      language = value
    }
    const url = await getSignedUrl(
      worker.storage,
      new GetObjectCommand({
        Bucket: worker.bucket,
        Key: run.audio_asset.object_key,
      }),
      { expiresIn: 3600 }
    )
    const begun = await worker.supabase.rpc("begin_media_transcription", {
      ...lease(job),
      p_audio_url: url,
    })
    if (begun.error || !begun.data)
      throw new Error("transcript_submission_checkpoint_unavailable")
    if (!begun.data.admitted) return reconcileMedia(worker, job, begun.data)
    let id: string | null = null
    try {
      id = await submitTranscript(job.job_id, url, language)
    } catch (error) {
      if (
        error instanceof AssemblyAIRequestError &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        error.statusCode !== 408
      )
        return failMedia(
          worker,
          job,
          "transcript_submission_rejected",
          false,
          0
        )
      /* A submission timeout is never permission to POST again. */
    }
    await waitForProvider(worker, job, id)
  } catch (error) {
    if (error instanceof ProbeError)
      return failMedia(worker, job, error.code, false)
    throw error
  }
}
