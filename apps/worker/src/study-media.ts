import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable } from "node:stream"
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { WorkerClients } from "./jobs.js"
import type { StudyDatabase, StudyJob } from "./study.js"
import { readBoundedFile } from "./document.js"
import { ProbeError, runCommand } from "./process.js"
import { subprocessEnvironment, withScratch } from "./scratch.js"

export class StudyMediaError extends Error {
  constructor(
    readonly code: string,
    readonly uncertain = false
  ) {
    super(code)
  }
}
type Lease = { p_job_id: string; p_lease_token: string }
interface Artifact {
  id: string
  object_key: string
  bytes: number
  sha256: string | null
  uploaded: boolean
}
interface MediaState {
  state: string
  script_sha256: string
  characters: number
  audio: Artifact
  video: Artifact | null
  admitted?: boolean
}
export type StudyMediaFunctions = {
  get_study_media: { Args: Lease; Returns: MediaState | null }
  begin_study_speech: {
    Args: Lease & { p_script_sha256: string; p_characters: number }
    Returns: MediaState | null
  }
  checkpoint_study_artifact: {
    Args: Lease & {
      p_role: string
      p_bytes: number
      p_sha256: string
      p_duration_ms: number
      p_provider_id: string
    }
    Returns: boolean
  }
  fail_study_speech: {
    Args: Lease & {
      p_uncertain: boolean
      p_error: string
      p_cost_usd: number | null
    }
    Returns: boolean
  }
  renew_study_output_job: { Args: Lease; Returns: boolean }
}
const lease = (job: StudyJob): Lease => ({
  p_job_id: job.job_id,
  p_lease_token: job.lease_token,
})
const sha = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex")
const AUDIO_BYTES = 2_000_000
const VIDEO_BYTES = 10_000_000

export async function checkStudyMediaTools(): Promise<void> {
  await Promise.all(
    ["ffmpeg", "ffprobe"].map((tool) =>
      runCommand(tool, ["-version"], {
        timeoutMs: 10_000,
        outputLimitBytes: 65_536,
      })
    )
  )
  if (!process.env.ASSEMBLYAI_API_KEY || !process.env.R2_BUCKET)
    throw new StudyMediaError("study_media_not_configured")
}

async function duration(
  path: string,
  scratch: string,
  video = false
): Promise<number> {
  const result = JSON.parse(
    await runCommand(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name",
        "-of",
        "json",
        path,
      ],
      {
        cwd: scratch,
        env: subprocessEnvironment(scratch),
        timeoutMs: 15_000,
        outputLimitBytes: 65_536,
      }
    )
  ) as {
    format?: { duration?: string }
    streams?: { codec_type?: string; codec_name?: string }[]
  }
  const milliseconds = Math.ceil(Number(result.format?.duration) * 1000)
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 120000 ||
    !result.streams?.some((stream) => stream.codec_type === "audio") ||
    (video
      ? !result.streams.some(
          (stream) =>
            stream.codec_type === "video" && stream.codec_name === "h264"
        )
      : result.streams.some((stream) => stream.codec_type === "video"))
  )
    throw new StudyMediaError("study_media_invalid")
  return milliseconds
}

// One bounded provider call. The caller persists its marker before entering here.
async function speech(
  script: string
): Promise<{ audio: Buffer; providerId: string }> {
  let response: Response
  try {
    response = await fetch("https://tts.us.assemblyai.com/v1/speech", {
      method: "POST",
      headers: {
        Authorization: process.env.ASSEMBLYAI_API_KEY!,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model_id: "assemblyai-tts-1",
        voice_id: "aai-jane",
        language: "english",
        text: script,
        encoding: "mp3",
        stream: false,
      }),
    })
  } catch {
    throw new StudyMediaError("speech_outcome_uncertain", true)
  }
  if (!response.ok)
    throw new StudyMediaError(
      "speech_provider_rejected",
      response.status >= 500 || response.status === 408
    )
  if (!response.body) throw new StudyMediaError("speech_response_missing", true)
  if (
    !response.headers.get("content-type")?.startsWith("audio/mpeg") ||
    response.headers.get("x-tts-model") !== "assemblyai-tts-1" ||
    Number(response.headers.get("x-tts-billed-characters")) !==
      Array.from(script).length
  ) {
    await response.body.cancel()
    throw new StudyMediaError("speech_response_invalid", true)
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > AUDIO_BYTES) {
        await reader.cancel()
        throw new StudyMediaError("speech_output_limit", true)
      }
      chunks.push(next.value)
    }
  } catch (error) {
    throw error instanceof StudyMediaError
      ? error
      : new StudyMediaError("speech_outcome_uncertain", true)
  } finally {
    reader.releaseLock()
  }
  if (!bytes) throw new StudyMediaError("speech_response_missing", true)
  return {
    audio: Buffer.concat(chunks, bytes),
    providerId: response.headers.get("x-request-id") ?? "",
  }
}

async function cachedArtifact(
  worker: WorkerClients,
  asset: Artifact,
  scriptHash: string,
  maximum: number
): Promise<{
  data: Buffer
  durationMs: number
  providerId: string
  hash: string
} | null> {
  let head
  try {
    head = await worker.storage.send(
      new HeadObjectCommand({ Bucket: worker.bucket, Key: asset.object_key }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "$metadata" in error &&
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
    )
      return null
    throw error
  }
  if (
    !head.ContentLength ||
    head.ContentLength > maximum ||
    head.Metadata?.script_sha256 !== scriptHash ||
    !head.Metadata?.sha256 ||
    (asset.sha256 && asset.sha256 !== head.Metadata.sha256)
  )
    throw new StudyMediaError("study_artifact_conflict")
  const result = await worker.storage.send(
    new GetObjectCommand({ Bucket: worker.bucket, Key: asset.object_key }),
    { abortSignal: AbortSignal.timeout(30_000) }
  )
  if (!(result.Body instanceof Readable))
    throw new StudyMediaError("study_artifact_unavailable")
  const body = result.Body,
    timer = setTimeout(
      () => body.destroy(new Error("artifact_read_timeout")),
      30_000
    )
  const chunks: Buffer[] = []
  let bytes = 0
  try {
    for await (const chunk of body as AsyncIterable<Buffer>) {
      bytes += chunk.length
      if (bytes > maximum)
        throw new StudyMediaError("study_artifact_size_limit")
      chunks.push(chunk)
    }
    const data = Buffer.concat(chunks, bytes)
    if (bytes !== head.ContentLength || sha(data) !== head.Metadata.sha256)
      throw new StudyMediaError("study_artifact_conflict")
    return {
      data,
      durationMs: Number(head.Metadata.duration_ms),
      providerId: head.Metadata.provider_id ?? "",
      hash: head.Metadata.sha256,
    }
  } finally {
    clearTimeout(timer)
    body.destroy()
  }
}

async function saveArtifact(
  worker: WorkerClients,
  asset: Artifact,
  data: Buffer,
  scriptHash: string,
  durationMs: number,
  providerId: string,
  video: boolean
): Promise<void> {
  try {
    await worker.storage.send(
      new PutObjectCommand({
        Bucket: worker.bucket,
        Key: asset.object_key,
        Body: data,
        ContentLength: data.length,
        ContentType: video ? "video/mp4" : "audio/mpeg",
        IfNoneMatch: "*",
        Metadata: {
          sha256: sha(data),
          script_sha256: scriptHash,
          duration_ms: String(durationMs),
          provider_id: providerId,
        },
      }),
      { abortSignal: AbortSignal.timeout(30_000) }
    )
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "$metadata" in error &&
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 412
    ))
      throw error
    const existing = await cachedArtifact(
      worker,
      asset,
      scriptHash,
      video ? VIDEO_BYTES : AUDIO_BYTES
    )
    if (!existing || existing.hash !== sha(data))
      throw new StudyMediaError("study_artifact_conflict")
  }
}

function wrapped(text: string, width: number): string {
  const words = text.replace(/[\r\n]+/g, " ").split(/\s+/),
    lines: string[] = []
  for (const word of words) {
    const last = lines.length - 1
    if (last < 0 || lines[last]!.length + word.length + 1 > width)
      lines.push(word)
    else lines[last] += ` ${word}`
  }
  return lines.join("\n")
}

export async function renderStudyVideo(
  content: Record<string, unknown>,
  scratch: string,
  audioPath: string,
  durationMs: number
): Promise<Buffer> {
  const slides = content.slides as {
    title: string
    bullets: string[]
    narration: string
  }[]
  const font =
    process.platform === "win32"
      ? "C\\:/Windows/Fonts/arial.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  const total = slides.reduce((sum, slide) => sum + slide.narration.length, 0)
  const filters: string[] = []
  let start = 0
  for (let index = 0; index < slides.length; index++) {
    const slide = slides[index]!,
      end =
        index === slides.length - 1
          ? durationMs / 1000
          : start + ((durationMs / 1000) * slide.narration.length) / total
    await writeFile(
      join(scratch, `title-${index}.txt`),
      wrapped(slide.title, 37),
      { flag: "wx" }
    )
    await writeFile(
      join(scratch, `body-${index}.txt`),
      slide.bullets.map((bullet) => `• ${wrapped(bullet, 90)}`).join("\n\n"),
      { flag: "wx" }
    )
    filters.push(
      `drawtext=fontfile='${font}':textfile=title-${index}.txt:expansion=none:fontsize=32:fontcolor=0x0f172a:x=56:y=55:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
    )
    filters.push(
      `drawtext=fontfile='${font}':textfile=body-${index}.txt:expansion=none:fontsize=20:fontcolor=0x334155:x=56:y=190:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
    )
    start = end
  }
  await writeFile(
    join(scratch, "brand.txt"),
    "Abstruck · AI-narrated study slides",
    { flag: "wx" }
  )
  filters.push(
    `drawtext=fontfile='${font}':textfile=brand.txt:expansion=none:fontsize=18:fontcolor=0x64748b:x=56:y=495`
  )
  const output = join(scratch, "study-video.mp4")
  await runCommand(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0xf8fafc:s=960x540:r=15:d=${durationMs / 1000}`,
      "-i",
      audioPath,
      "-vf",
      filters.join(","),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-shortest",
      "-movflags",
      "+faststart",
      "-fs",
      String(VIDEO_BYTES),
      output,
    ],
    {
      cwd: scratch,
      env: subprocessEnvironment(scratch),
      timeoutMs: 120_000,
      outputLimitBytes: 65_536,
    }
  )
  const actual = await duration(output, scratch, true)
  if (Math.abs(actual - durationMs) > 1000)
    throw new StudyMediaError("study_video_duration_mismatch")
  return readBoundedFile(output, VIDEO_BYTES)
}

export async function ensureStudyMedia(
  worker: WorkerClients,
  database: SupabaseClient<StudyDatabase>,
  job: StudyJob,
  content: Record<string, unknown>
): Promise<void> {
  const script =
    job.type === "podcast"
      ? (content.script as { text: string }[])
          .map((line) => line.text)
          .join("\n")
      : (content.slides as { narration: string }[])
          .map((slide) => slide.narration)
          .join("\n")
  if (!script.trim() || script.length > 600)
    throw new StudyMediaError("speech_script_limit")
  const hash = sha(script)
  const renewed = await database.rpc("renew_study_output_job", lease(job))
  if (renewed.error || !renewed.data)
    throw new StudyMediaError("study_lease_unavailable")
  const begun = await database.rpc("begin_study_speech", {
    ...lease(job),
    p_script_sha256: hash,
    p_characters: Array.from(script).length,
  })
  if (begun.error || !begun.data)
    throw new StudyMediaError(
      begun.error?.message.includes("storage_quota_exceeded")
        ? "storage_quota_exceeded"
        : "study_speech_admission_failed"
    )
  const state = begun.data
  if (
    state.audio.object_key !==
      `${job.owner_id}/study-sets/${job.study_set_id}/audio-v1.mp3` ||
    (state.video &&
      state.video.object_key !==
        `${job.owner_id}/study-sets/${job.study_set_id}/video-v1.mp4`)
  )
    throw new StudyMediaError("study_artifact_boundary")
  await withScratch(async (scratch) => {
    let audio = await cachedArtifact(worker, state.audio, hash, AUDIO_BYTES)
    if (!audio) {
      if (!state.admitted)
        throw new StudyMediaError("speech_outcome_uncertain", true)
      let knownCost: number | null = null
      try {
        const result = await speech(script)
        knownCost = (Array.from(script).length * 15) / 1e6
        const path = join(scratch, "narration.mp3")
        await writeFile(path, result.audio, { flag: "wx" })
        const durationMs = await duration(path, scratch)
        await saveArtifact(
          worker,
          state.audio,
          result.audio,
          hash,
          durationMs,
          result.providerId,
          false
        )
        audio = {
          data: result.audio,
          durationMs,
          providerId: result.providerId,
          hash: sha(result.audio),
        }
      } catch (error) {
        const failure =
          error instanceof StudyMediaError
            ? error
            : new StudyMediaError(
                error instanceof ProbeError
                  ? error.code
                  : "speech_save_uncertain",
                knownCost === null
              )
        await database.rpc("fail_study_speech", {
          ...lease(job),
          p_error: failure.code,
          p_uncertain: failure.uncertain,
          p_cost_usd: knownCost,
        })
        throw failure
      }
    }
    const savedAudio = await database.rpc("checkpoint_study_artifact", {
      ...lease(job),
      p_role: "study_audio",
      p_bytes: audio.data.length,
      p_sha256: audio.hash,
      p_duration_ms: audio.durationMs,
      p_provider_id: audio.providerId,
    })
    if (savedAudio.error || !savedAudio.data)
      throw new StudyMediaError("study_audio_save_pending", true)
    if (job.type !== "video") return
    if (!state.video) throw new StudyMediaError("study_video_asset_missing")
    let video = await cachedArtifact(worker, state.video, hash, VIDEO_BYTES)
    if (!video) {
      const path = join(scratch, "video-narration.mp3")
      await writeFile(path, audio.data, { flag: "wx" })
      const data = await renderStudyVideo(
        content,
        scratch,
        path,
        audio.durationMs
      )
      await saveArtifact(
        worker,
        state.video,
        data,
        hash,
        audio.durationMs,
        audio.providerId,
        true
      )
      video = {
        data,
        durationMs: audio.durationMs,
        providerId: audio.providerId,
        hash: sha(data),
      }
    }
    const savedVideo = await database.rpc("checkpoint_study_artifact", {
      ...lease(job),
      p_role: "study_video",
      p_bytes: video.data.length,
      p_sha256: video.hash,
      p_duration_ms: video.durationMs,
      p_provider_id: video.providerId,
    })
    if (savedVideo.error || !savedVideo.data)
      throw new StudyMediaError("study_video_save_pending", true)
  })
}
