import "server-only"

import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { SharedArtifactLink, SharedSourceLink } from "@/lib/sharing-types"
import { ShareError, shareTokenHash, sharingObject } from "@/lib/sharing"
import { createAdminClient } from "@/lib/supabase/admin"

interface SharedAsset {
  object_key: string
  title: string
  source_type: string
  mime: string
  bytes: number
  source_sha256: string | null
  durationMs?: number
}

async function allowedAsset(
  tokenHash: string,
  sourceKey: string
): Promise<SharedAsset> {
  const { data, error } = await createAdminClient().rpc(
    "shared_source_by_hash",
    { p_token_hash: tokenHash, p_source_key: sourceKey }
  )
  if (
    error ||
    !sharingObject(data) ||
    typeof data.object_key !== "string" ||
    typeof data.mime !== "string" ||
    typeof data.bytes !== "number"
  )
    throw new ShareError("share_unavailable", 404)
  return data as unknown as SharedAsset
}

export async function getSharedSourceLink(
  token: string,
  sourceKey: string
): Promise<SharedSourceLink> {
  if (!/^source_[1-3]$/.test(sourceKey))
    throw new ShareError("share_unavailable", 404)
  const hash = shareTokenHash(token)
  return signAllowedAsset(() => allowedAsset(hash, sourceKey))
}

async function allowedArtifact(tokenHash: string): Promise<SharedAsset> {
  const { data, error } = await createAdminClient().rpc(
    "shared_artifact_by_hash",
    {
      p_token_hash: tokenHash,
    }
  )
  if (
    error ||
    !sharingObject(data) ||
    typeof data.object_key !== "string" ||
    !["audio/mpeg", "video/mp4"].includes(String(data.mime)) ||
    typeof data.bytes !== "number" ||
    typeof data.source_sha256 !== "string" ||
    typeof data.durationMs !== "number"
  )
    throw new ShareError("share_unavailable", 404)
  return data as unknown as SharedAsset
}

export async function getSharedArtifactLink(
  token: string
): Promise<SharedArtifactLink> {
  const hash = shareTokenHash(token)
  const asset = await allowedArtifact(hash)
  const signed = await signAllowedAsset(() => allowedArtifact(hash))
  return {
    ...signed,
    mime: signed.mime as SharedArtifactLink["mime"],
    bytes: asset.bytes,
    durationMs: asset.durationMs ?? 0,
  }
}

async function signAllowedAsset(
  load: () => Promise<SharedAsset>
): Promise<SharedSourceLink> {
  const asset = await load()
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  )
    throw new ShareError("share_unavailable", 503)
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 1,
  })
  try {
    const existing = await client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: asset.object_key }),
      { abortSignal: AbortSignal.timeout(10000) }
    )
    if (existing.ContentLength !== asset.bytes)
      throw new ShareError("share_unavailable", 404)
    // Recheck revocation, expiry, ownership, and the frozen source after the storage request.
    const current = await load()
    if (
      current.object_key !== asset.object_key ||
      current.bytes !== asset.bytes ||
      current.mime !== asset.mime ||
      current.source_sha256 !== asset.source_sha256
    )
      throw new ShareError("share_unavailable", 404)
    const fileName =
      asset.title.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 240) ||
      "source"
    const disposition = ["docx", "pptx"].includes(asset.source_type)
      ? "attachment"
      : "inline"
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: asset.object_key,
        ResponseContentType: asset.mime,
        ResponseContentDisposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 60 }
    )
    return {
      url,
      mime: asset.mime,
      fileName,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }
  } finally {
    client.destroy()
  }
}
