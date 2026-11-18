import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { join } from "node:path";
import { ProbeError, runCommand } from "./process.js";
import { subprocessEnvironment, withScratch } from "./scratch.js";

export const MAX_MEDIA_BYTES = 250_000_000;
export const MAX_DURATION_SECONDS = 3_600;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const AUDIO_FORMAT = "bestaudio[protocol=https][vcodec=none][ext=m4a]/bestaudio[protocol=https][vcodec=none][ext=webm]";
export const YOUTUBE_AUDIO_BYTES = 25_000_000;

export interface YouTubeMetadata extends VideoSource {
  title: string;
  durationSeconds: number;
  formatId: string;
  extension: "m4a" | "webm";
  expectedBytes: number | null;
}

export function validateAudioUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new ProbeError("youtube_audio_url_rejected"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !/^[a-z0-9-]+\.googlevideo\.com$/.test(url.hostname) || url.pathname !== "/videoplayback") {
    throw new ProbeError("youtube_audio_url_rejected");
  }
  return url;
}

export function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return a !== 0 && a !== 10 && a !== 127 && a < 224 &&
    !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 0 || b === 168)) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0);
}

async function downloadAudio(input: string, userAgent: string, signal: AbortSignal, redirects = 0): Promise<Buffer> {
  const url = validateAudioUrl(input);
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIpv4(address))) {
    throw new ProbeError("youtube_audio_network_rejected");
  }
  const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    const connection = request(url, {
      signal, agent: false, family: 4,
      // Pin the checked address so a second DNS resolution cannot change the destination.
      lookup: (_hostname, _options, callback) => callback(null, addresses[0]!.address, 4),
      headers: { "User-Agent": userAgent, Accept: "*/*" },
    }, resolve);
    connection.on("error", reject);
    connection.end();
  });
  try {
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      if (redirects >= 3 || !response.headers.location) throw new ProbeError("youtube_audio_redirect_limit");
      response.destroy();
      return downloadAudio(new URL(response.headers.location, url).href, userAgent, signal, redirects + 1);
    }
    if (response.statusCode !== 200) throw new ProbeError(`youtube_audio_http_${response.statusCode ?? 0}`);
    const declared = Number(response.headers["content-length"]);
    if (response.headers["content-length"] && (!Number.isSafeInteger(declared) || declared < 1 || declared > YOUTUBE_AUDIO_BYTES)) {
      throw new ProbeError("youtube_audio_size_limit");
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response as AsyncIterable<Buffer>) {
      bytes += chunk.length;
      if (bytes > YOUTUBE_AUDIO_BYTES) throw new ProbeError("youtube_audio_size_limit");
      chunks.push(chunk);
    }
    if (!bytes || (response.headers["content-length"] && bytes !== declared)) throw new ProbeError("youtube_audio_size_mismatch");
    return Buffer.concat(chunks, bytes);
  } finally { response.destroy(); }
}

export async function acquireYouTubeAudio(
  input: string,
  scratch: string,
  checkpoint: (metadata: YouTubeMetadata) => Promise<void>,
): Promise<{ path: string; metadata: YouTubeMetadata; sha256: string; bytes: number }> {
  const source = parseYouTubeUrl(input);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await runCommand("yt-dlp", [
      ...sourceArgs, "--skip-download", "--dump-single-json", "--", source.url,
    ], { cwd: scratch, env: subprocessEnvironment(scratch), timeoutMs: 90_000, outputLimitBytes: 8_388_608 })) as Record<string, unknown>;
  } catch (error) {
    throw new ProbeError(error instanceof ProbeError ? `youtube_metadata_${error.code}` : "youtube_metadata_invalid");
  }
  const durationSeconds = validateMetadata(parsed, source.videoId);
  if (parsed.age_limit !== 0 || typeof parsed.title !== "string" || !parsed.title.trim() ||
      typeof parsed.url !== "string" || parsed.protocol !== "https" || parsed.vcodec !== "none" ||
      !["m4a", "webm"].includes(String(parsed.ext)) || typeof parsed.format_id !== "string") {
    throw new ProbeError("youtube_audio_format_unavailable");
  }
  validateAudioUrl(parsed.url);
  const expectedBytes = typeof parsed.filesize === "number" ? parsed.filesize : null;
  if (expectedBytes !== null && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > YOUTUBE_AUDIO_BYTES)) {
    throw new ProbeError("youtube_audio_size_limit");
  }
  const metadata: YouTubeMetadata = {
    ...source, title: parsed.title.trim().slice(0, 240), durationSeconds,
    formatId: parsed.format_id.slice(0, 80), extension: parsed.ext as "m4a" | "webm", expectedBytes,
  };
  await checkpoint(metadata);
  const headers = parsed.http_headers as Record<string, unknown> | undefined;
  const candidateAgent = headers?.["User-Agent"];
  const agent = typeof candidateAgent === "string" && candidateAgent.length <= 500 && !/[\r\n]/.test(candidateAgent)
    ? candidateAgent : "Abstruck/1.0";
  let bytes: Buffer;
  try { bytes = await downloadAudio(parsed.url, agent, AbortSignal.timeout(120_000)); }
  catch (error) {
    if (error instanceof ProbeError) throw error;
    throw new ProbeError(error instanceof Error && error.name === "AbortError" ? "youtube_audio_timeout" : "youtube_audio_network_failed");
  }
  if (expectedBytes !== null && bytes.length !== expectedBytes) throw new ProbeError("youtube_audio_size_mismatch");
  const path = join(scratch, `youtube.${metadata.extension}`);
  await writeFile(path, bytes, { flag: "wx" });
  return { path, metadata, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export interface VideoSource {
  videoId: string;
  url: string;
}

export function parseYouTubeUrl(input: string): VideoSource {
  let url: URL;
  try { url = new URL(input); } catch { throw new ProbeError("unsupported_youtube_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.searchParams.has("list")) throw new ProbeError("unsupported_youtube_url");
  let id: string | null = null;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) {
      id = url.searchParams.get("v");
    } else {
      id = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})$/)?.[1] ?? null;
    }
  }
  if (!id || !VIDEO_ID.test(id)) throw new ProbeError("unsupported_youtube_url");
  return { videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
}

export function validateMetadata(value: unknown, videoId: string): number {
  if (!value || typeof value !== "object") throw new ProbeError("invalid_source_metadata");
  const item = value as Record<string, unknown>;
  if (item.id !== videoId || item._type === "playlist" || item.entries) {
    throw new ProbeError("invalid_source_metadata");
  }
  if (item.availability !== "public" || item.is_live !== false ||
      item.live_status === "is_upcoming" || item.live_status === "post_live") {
    throw new ProbeError("source_not_public_finished_video");
  }
  if (typeof item.duration !== "number" || !Number.isFinite(item.duration) ||
      item.duration <= 0 || item.duration > MAX_DURATION_SECONDS) {
    throw new ProbeError("source_duration_limit");
  }
  return item.duration;
}

export function validateMediaSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_MEDIA_BYTES) {
    throw new ProbeError("media_size_limit");
  }
}

const sourceArgs = [
  "--ignore-config", "--no-plugin-dirs", "--no-remote-components",
  "--js-runtimes", "node", "--no-playlist", "--no-progress", "--no-warnings",
  "--socket-timeout", "15", "--retries", "1", "--fragment-retries", "1",
  "--no-cache-dir", "--format", AUDIO_FORMAT,
] as const;

export interface AcquisitionEvidence {
  videoId: string;
  durationSeconds: number;
  bytes: number;
  sha256: string;
  elapsedMs: number;
  mediaRemoved: true;
}

export async function acquireYouTube(input: string): Promise<AcquisitionEvidence> {
  const source = parseYouTubeUrl(input);
  // Linux prlimit supplies a hard file-size boundary even when Content-Length is absent.
  if (process.platform !== "linux") throw new ProbeError("linux_container_required");
  const started = Date.now();
  return withScratch(async (scratch) => {
    const environment = subprocessEnvironment(scratch);
    const metadata = await runCommand("yt-dlp", [
      ...sourceArgs, "--dump-single-json", "--", source.url,
    ], { cwd: scratch, env: environment, timeoutMs: 90_000, outputLimitBytes: 8_388_608 });
    let parsed: unknown;
    try { parsed = JSON.parse(metadata); } catch { throw new ProbeError("invalid_source_metadata"); }
    validateMetadata(parsed, source.videoId);

    await runCommand("prlimit", [
      `--fsize=${MAX_MEDIA_BYTES}:${MAX_MEDIA_BYTES}`, "--",
      "yt-dlp", ...sourceArgs, "--max-filesize", String(MAX_MEDIA_BYTES),
      "--match-filter", "!is_live & duration <= 3600 & availability = public",
      "--no-part", "--no-continue", "--output", "source.media", "--", source.url,
    ], { cwd: scratch, env: environment, timeoutMs: 600_000 });

    const mediaPath = join(scratch, "source.media");
    const file = await lstat(mediaPath).catch(() => { throw new ProbeError("no_media_acquired"); });
    if (!file.isFile() || file.isSymbolicLink()) throw new ProbeError("invalid_media_artifact");
    validateMediaSize(file.size);
    const inspection = await runCommand("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", mediaPath,
    ], { cwd: scratch, env: environment, timeoutMs: 30_000 });
    const media = JSON.parse(inspection) as {
      format?: { duration?: string }; streams?: { codec_type?: string }[];
    };
    const duration = Number(media.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS ||
        !media.streams?.some((stream) => stream.codec_type === "audio") ||
        media.streams?.some((stream) => stream.codec_type === "video")) {
      throw new ProbeError("invalid_or_overlong_audio");
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(mediaPath)) hash.update(chunk);
    return {
      videoId: source.videoId,
      durationSeconds: duration,
      bytes: file.size,
      sha256: hash.digest("hex"),
      elapsedMs: Date.now() - started,
      mediaRemoved: true,
    };
  });
}
