import {
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3"
import { ProbeError } from "./process.js"

export interface CleanupTranscript {
  id: string | null
  audioUrl: string | null
  state: string
}
export interface CleanupManifest {
  prefix: string
  drainUntil: string
  assets: { key: string; metadata: Record<string, unknown> }[]
  transcripts: CleanupTranscript[]
}
const uuid = /^[a-f0-9-]{36}$/i
const providerOrigin = "https://api.assemblyai.com"

async function transcriptRequest(
  url: string,
  method = "GET"
): Promise<Record<string, unknown> | null> {
  const parsed = new URL(url, providerOrigin)
  if (
    parsed.origin !== providerOrigin ||
    !parsed.pathname.startsWith("/v2/transcript") ||
    parsed.href.length > 4096
  )
    throw new ProbeError("provider_cleanup_boundary")
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!key) throw new ProbeError("assemblyai_configuration_missing")
  const response = await fetch(parsed, {
    method,
    redirect: "error",
    headers: { Authorization: key },
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 404) {
    await response.body?.cancel()
    return null
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new ProbeError("provider_cleanup_unavailable")
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.byteLength
    if (bytes > 2_000_000)
      throw new ProbeError("provider_cleanup_response_limit")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >
}

async function reconcileUncertainTranscript(
  audioUrl: string
): Promise<string[]> {
  let next: string | null = "/v2/transcript?limit=100"
  const ids: string[] = []
  for (let page = 0; next && page < 20; page++) {
    const result = await transcriptRequest(next)
    if (!result || !Array.isArray(result.transcripts))
      throw new ProbeError("provider_cleanup_reconciliation_unavailable")
    for (const row of result.transcripts as {
      id?: unknown
      audio_url?: unknown
    }[])
      if (
        row.audio_url === audioUrl &&
        typeof row.id === "string" &&
        uuid.test(row.id)
      )
        ids.push(row.id)
    const pagination = result.page_details as { prev_url?: unknown } | undefined
    next = typeof pagination?.prev_url === "string" ? pagination.prev_url : null
  }
  if (next) throw new ProbeError("provider_cleanup_reconciliation_limit")
  return ids
}

/** Safe to repeat after a lease loss; every key must remain inside the generated owner prefix. */
export async function cleanupOwnedArtifacts(
  storage: S3Client,
  bucket: string,
  ownerId: string,
  manifest: CleanupManifest
): Promise<void> {
  if (
    !uuid.test(ownerId) ||
    !manifest.prefix.startsWith(`${ownerId}/`) ||
    !new RegExp(`^${ownerId}/(?:[a-f0-9-]{36}/)?$`, "i").test(
      manifest.prefix
    ) ||
    manifest.assets.some((asset) => !asset.key.startsWith(manifest.prefix))
  )
    throw new ProbeError("cleanup_owner_boundary")
  for (const transcript of manifest.transcripts) {
    const ids = transcript.id
      ? [transcript.id]
      : transcript.audioUrl
        ? await reconcileUncertainTranscript(transcript.audioUrl)
        : []
    for (const id of ids) {
      if (!uuid.test(id)) throw new ProbeError("provider_cleanup_id_invalid")
      const current = await transcriptRequest(`/v2/transcript/${id}`)
      if (
        current &&
        transcript.audioUrl &&
        current.audio_url !== transcript.audioUrl &&
        current.status !== "deleted"
      )
        throw new ProbeError("provider_cleanup_source_mismatch")
      if (current && current.status !== "deleted")
        await transcriptRequest(`/v2/transcript/${id}`, "DELETE")
    }
  }
  // Pending parts and objects can outlive their relational rows; list the strict prefix too.
  let keyMarker: string | undefined, uploadMarker: string | undefined
  for (let page = 0; page < 100; page++) {
    const uploads = await storage.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        Prefix: manifest.prefix,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadMarker,
        MaxUploads: 100,
      }),
      { abortSignal: AbortSignal.timeout(30_000) }
    )
    for (const upload of uploads.Uploads ?? []) {
      if (!upload.Key?.startsWith(manifest.prefix) || !upload.UploadId)
        throw new ProbeError("cleanup_owner_boundary")
      await storage
        .send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          }),
          { abortSignal: AbortSignal.timeout(30_000) }
        )
        .catch((error: unknown) => {
          if (
            !error ||
            typeof error !== "object" ||
            !("$metadata" in error) ||
            (error.$metadata as { httpStatusCode?: number }).httpStatusCode !==
              404
          )
            throw error
        })
    }
    if (!uploads.IsTruncated) break
    keyMarker = uploads.NextKeyMarker
    uploadMarker = uploads.NextUploadIdMarker
    if (page === 99) throw new ProbeError("cleanup_object_limit")
  }
  for (let page = 0; page < 100; page++) {
    // Start at the beginning after deletion; continuation tokens may reference removed keys.
    const objects = await storage.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: manifest.prefix,
        MaxKeys: 1000,
      }),
      { abortSignal: AbortSignal.timeout(30_000) }
    )
    const keys = (objects.Contents ?? [])
      .map((row) => row.Key)
      .filter((key): key is string => !!key)
    if (!keys.length) return
    if (keys.some((key) => !key.startsWith(manifest.prefix)))
      throw new ProbeError("cleanup_owner_boundary")
    const deleted = await storage.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
      }),
      { abortSignal: AbortSignal.timeout(30_000) }
    )
    if (deleted.Errors?.length) throw new ProbeError("storage_cleanup_pending")
  }
  throw new ProbeError("cleanup_object_limit")
}
