import { createHash, createHmac } from "node:crypto"
import { join } from "node:path"
import { readBoundedFile } from "./document.js"
import { ProbeError, runCommand } from "./process.js"
import { subprocessEnvironment } from "./scratch.js"

export const MEDIA_LIMITS = {
  inputBytes: 250_000_000,
  audioBytes: 50_000_000,
  durationMs: 3_600_000,
  responseBytes: 8_388_608,
  providerTimeoutMs: 30_000,
  maxPolls: 120,
} as const
const ORIGIN = "https://api.assemblyai.com"
export const MEDIA_MODEL = "universal-2"
export const MEDIA_RATE_PER_HOUR = 0.17

export class AssemblyAIRequestError extends ProbeError {
  constructor(readonly statusCode: number) {
    super("transcript_provider_rejected")
  }
}

export interface MediaInfo {
  durationMs: number
  kind: "audio" | "video"
  mime: string
  videoCodec: string | null
  audioCodec: string
}
export interface TranscriptSegment {
  ordinal: number
  text: string
  locator: { type: "time"; start_ms: number; end_ms: number; speaker?: string }
  extraction_method: "transcript"
  extraction_status: "ready"
  unreadable_regions: string[]
}
export interface MediaChapter {
  startMs: number
  endMs: number
  title: string
  summary: string
}
export interface TranscriptOutput {
  segments: TranscriptSegment[]
  providerSeconds: number
  costUsd: number
  language: string | null
  chapters?: MediaChapter[]
  chaptersStatus: "ready" | "unavailable"
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)
const mimeTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
}
const formats: Record<string, string[]> = {
  mp3: ["mp3"],
  m4a: ["mov", "mp4", "m4a"],
  wav: ["wav"],
  ogg: ["ogg"],
  mp4: ["mov", "mp4"],
  mov: ["mov", "mp4"],
  webm: ["matroska", "webm"],
}

export async function inspectMedia(
  path: string,
  extension: string,
  scratch: string,
  expectedKind?: "audio" | "video"
): Promise<MediaInfo> {
  if (!formats[extension]) throw new ProbeError("unsupported_media_type")
  const result: unknown = JSON.parse(
    await runCommand(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,format_name:stream=codec_type,codec_name",
        "-of",
        "json",
        path,
      ],
      {
        cwd: scratch,
        env: subprocessEnvironment(scratch),
        timeoutMs: 30_000,
        outputLimitBytes: 65_536,
      }
    )
  )
  if (
    !record(result) ||
    !record(result.format) ||
    !Array.isArray(result.streams)
  )
    throw new ProbeError("invalid_media_file")
  const durationMs = Math.ceil(Number(result.format.duration) * 1000)
  const detected =
    typeof result.format.format_name === "string"
      ? result.format.format_name.split(",")
      : []
  const audio = result.streams.find(
    (stream: unknown) => record(stream) && stream.codec_type === "audio"
  ) as Record<string, unknown> | undefined
  const video = result.streams.find(
    (stream: unknown) => record(stream) && stream.codec_type === "video"
  ) as Record<string, unknown> | undefined
  const kind =
    expectedKind ??
    (["mp4", "mov", "webm"].includes(extension) ? "video" : "audio")
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > MEDIA_LIMITS.durationMs
  )
    throw new ProbeError("media_duration_limit")
  if (
    !audio ||
    typeof audio.codec_name !== "string" ||
    (kind === "video" && !video) ||
    (kind === "audio" && video) ||
    !formats[extension]!.some((format) => detected.includes(format))
  )
    throw new ProbeError("media_type_mismatch")
  return {
    durationMs,
    kind,
    mime: mimeTypes[extension]!,
    audioCodec: audio.codec_name,
    videoCodec: typeof video?.codec_name === "string" ? video.codec_name : null,
  }
}

export async function normalizeAudio(
  path: string,
  scratch: string,
  sourceDurationMs: number
): Promise<{ audio: Buffer; durationMs: number }> {
  const output = join(scratch, "audio.mp3")
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-t",
    "3601",
    "-fs",
    String(MEDIA_LIMITS.audioBytes),
    output,
  ]
  await runCommand(
    process.platform === "linux" ? "prlimit" : "ffmpeg",
    process.platform === "linux"
      ? [
          `--fsize=${MEDIA_LIMITS.audioBytes}:${MEDIA_LIMITS.audioBytes}`,
          "--",
          "ffmpeg",
          ...args,
        ]
      : args,
    {
      cwd: scratch,
      env: subprocessEnvironment(scratch),
      timeoutMs: 120_000,
      outputLimitBytes: 65_536,
    }
  )
  const info = await inspectMedia(output, "mp3", scratch)
  if (Math.abs(info.durationMs - sourceDurationMs) > 1000)
    throw new ProbeError("media_duration_mismatch")
  return {
    audio: await readBoundedFile(output, MEDIA_LIMITS.audioBytes),
    durationMs: Math.max(sourceDurationMs, info.durationMs),
  }
}

export function callbackToken(jobId: string): string {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET
  if (!secret) throw new ProbeError("assemblyai_webhook_configuration_missing")
  return `${jobId}.${createHmac("sha256", secret).update(jobId).digest("hex")}`
}

async function provider(
  path: string,
  method = "GET",
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new ProbeError("assemblyai_configuration_missing")
  const response = await fetch(ORIGIN + path, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(MEDIA_LIMITS.providerTimeoutMs),
    headers: {
      Authorization: key,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.body) throw new ProbeError("transcript_response_missing")
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > MEDIA_LIMITS.responseBytes)
      throw new ProbeError("transcript_response_limit")
    chunks.push(chunk)
  }
  if (!response.ok) throw new AssemblyAIRequestError(response.status)
  const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!record(result)) throw new ProbeError("transcript_provider_unavailable")
  return result
}

export async function submitTranscript(
  jobId: string,
  audioUrl: string,
  language: "auto" | "en" | "tl" = "auto"
): Promise<string> {
  const webhook = process.env.ASSEMBLYAI_WEBHOOK_URL
  if (!webhook || new URL(webhook).protocol !== "https:")
    throw new ProbeError("assemblyai_webhook_configuration_missing")
  const result = await provider("/v2/transcript", "POST", {
    audio_url: audioUrl,
    speech_models: [MEDIA_MODEL],
    ...(language === "auto"
      ? {
          language_detection: true,
          language_detection_options: { code_switching: true },
        }
      : { language_code: language }),
    speech_understanding: {
      request: { summarization: { summary_type: "paragraph", effort: "low" } },
    },
    webhook_url: webhook,
    webhook_auth_header_name: "x-assemblyai-webhook-secret",
    webhook_auth_header_value: callbackToken(jobId),
  })
  if (typeof result.id !== "string" || !/^[a-f0-9-]{36}$/i.test(result.id))
    throw new ProbeError("transcript_submission_unknown")
  return result.id
}

export async function getTranscript(
  id: string
): Promise<Record<string, unknown>> {
  if (!/^[a-f0-9-]{36}$/i.test(id))
    throw new ProbeError("invalid_transcript_id")
  return provider(`/v2/transcript/${id}`)
}

export async function reconcileTranscript(
  audioUrl: string
): Promise<string | null> {
  const result = await provider("/v2/transcript?limit=100")
  if (!Array.isArray(result.transcripts))
    throw new ProbeError("transcript_reconciliation_unavailable")
  const matches = result.transcripts.filter(
    (value: unknown) =>
      record(value) &&
      value.audio_url === audioUrl &&
      typeof value.id === "string"
  )
  if (matches.length > 1)
    throw new ProbeError("transcript_reconciliation_ambiguous")
  return matches.length === 1 ? (matches[0] as { id: string }).id : null
}

export function transcriptOutput(
  value: Record<string, unknown>,
  durationMs: number,
  audioUrl: string,
  ratePerHour = MEDIA_RATE_PER_HOUR
): TranscriptOutput {
  if (
    value.audio_url !== audioUrl ||
    value.status !== "completed" ||
    value.speech_model_used !== MEDIA_MODEL ||
    typeof value.audio_duration !== "number" ||
    value.audio_duration < 1 ||
    value.audio_duration > Math.ceil(durationMs / 1000) ||
    !Array.isArray(value.words) ||
    value.words.length > 50_000
  )
    throw new ProbeError("transcript_validation_failed")
  const segments: TranscriptSegment[] = []
  let start = 0,
    end = 0,
    lastStart = -1,
    text = ""
  const flush = (): void => {
    if (!text) return
    segments.push({
      ordinal: segments.length + 1,
      text,
      locator: { type: "time", start_ms: start, end_ms: end },
      extraction_method: "transcript",
      extraction_status: "ready",
      unreadable_regions: [],
    })
    text = ""
  }
  for (const word of value.words) {
    if (
      !record(word) ||
      typeof word.text !== "string" ||
      word.text.length > 500 ||
      !Number.isSafeInteger(word.start) ||
      !Number.isSafeInteger(word.end) ||
      (word.start as number) < 0 ||
      (word.end as number) < (word.start as number) ||
      (word.end as number) > durationMs + 1000 ||
      (word.start as number) < lastStart
    )
      throw new ProbeError("transcript_timestamp_invalid")
    if (!text) start = word.start as number
    text += (text ? " " : "") + word.text
    end = word.end as number
    lastStart = word.start as number
    if (/[.!?]$/.test(word.text) || text.length >= 500 || end - start >= 20_000)
      flush()
  }
  flush()
  if (!segments.length) throw new ProbeError("media_no_speech")
  if (segments.length > 1000) throw new ProbeError("transcript_segment_limit")
  const chapters = providerChapters(value, durationMs)
  return {
    segments,
    providerSeconds: Math.ceil(value.audio_duration),
    costUsd: Number(((value.audio_duration * ratePerHour) / 3600).toFixed(10)),
    language:
      typeof value.language_code === "string" ? value.language_code : null,
    ...(chapters?.length ? { chapters } : {}),
    chaptersStatus: chapters?.length ? "ready" : "unavailable",
  }
}

function providerChapters(
  value: Record<string, unknown>,
  durationMs: number
): MediaChapter[] | undefined {
  const understanding = value.speech_understanding
  const response = record(understanding) ? understanding.response : undefined
  const summary = record(response) ? response.summarization : undefined
  if (
    !record(summary) ||
    summary.status !== "success" ||
    !Array.isArray(summary.summary) ||
    summary.summary.length > 200
  )
    return undefined
  const chapters: MediaChapter[] = []
  let end = 0
  for (const chapter of summary.summary) {
    if (
      !record(chapter) ||
      !Number.isSafeInteger(chapter.start) ||
      !Number.isSafeInteger(chapter.end) ||
      (chapter.start as number) < end ||
      (chapter.end as number) < (chapter.start as number) ||
      (chapter.end as number) > durationMs + 1000 ||
      typeof chapter.headline !== "string" ||
      !chapter.headline.trim() ||
      chapter.headline.length > 300 ||
      typeof chapter.text !== "string" ||
      !chapter.text.trim() ||
      chapter.text.length > 5000
    )
      return undefined
    chapters.push({
      startMs: chapter.start as number,
      endMs: chapter.end as number,
      title: chapter.headline,
      summary: chapter.text,
    })
    end = chapter.end as number
  }
  return chapters
}

export function audioUrlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex")
}
