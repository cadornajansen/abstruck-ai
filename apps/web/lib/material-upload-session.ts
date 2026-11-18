import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, Tables } from "@/lib/supabase/database.types"
import {
  UPLOAD_PART_BYTES,
  type FileUploadAuthorization,
} from "@/lib/file-upload"
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  inspectObject,
  listUploadParts,
  signUpload,
  signUploadPart,
  storageObjectMissing,
} from "@/lib/storage/r2"

type UploadAsset = Tables<"assets">

function metadata(asset: UploadAsset): Record<string, Json | undefined> {
  return asset.metadata &&
    typeof asset.metadata === "object" &&
    !Array.isArray(asset.metadata)
    ? asset.metadata
    : {}
}

function multipartId(asset: UploadAsset): string | null {
  const value = metadata(asset).multipartUploadId
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    ? value
    : null
}

export async function ownedUploadAsset(
  materialId: string,
  ownerId: string
): Promise<UploadAsset | null> {
  const { data, error } = await createAdminClient()
    .from("assets")
    .select("*")
    .eq("material_id", materialId)
    .eq("owner_id", ownerId)
    .eq("role", "original")
    .maybeSingle()
  if (error) throw new Error("upload_lookup_failed")
  return data
}

async function objectVerified(asset: UploadAsset): Promise<boolean> {
  try {
    const object = await inspectObject(asset.object_key)
    if (
      object.ContentLength !== asset.bytes ||
      object.ContentType !== asset.mime
    )
      throw new Error("upload_object_conflict")
    return true
  } catch (error) {
    if (storageObjectMissing(error)) return false
    throw error
  }
}

async function allocateMultipart(asset: UploadAsset): Promise<UploadAsset> {
  const db = createAdminClient()
  const id = await createMultipartUpload(asset.object_key, asset.mime)
  const { data, error } = await db
    .from("assets")
    .update({ metadata: { ...metadata(asset), multipartUploadId: id } })
    .eq("id", asset.id)
    .eq("owner_id", asset.owner_id)
    .is("uploaded_at", null)
    .eq("metadata", JSON.stringify(asset.metadata))
    .select("*")
    .maybeSingle()
  if (error || !data) {
    // Only one session wins a simultaneous start; discard the losing storage session.
    await abortMultipartUpload(asset.object_key, id)
    if (error) throw new Error("upload_session_save_failed")
    const winner = await ownedUploadAsset(asset.material_id!, asset.owner_id)
    if (!winner || !multipartId(winner))
      throw new Error("upload_session_changed")
    return winner
  }
  return data
}

function checkedParts(
  asset: UploadAsset,
  parts: Awaited<ReturnType<typeof listUploadParts>>
) {
  const count = Math.ceil(asset.bytes / UPLOAD_PART_BYTES)
  const seen = new Set<number>()
  for (const part of parts) {
    const expected = Math.min(
      UPLOAD_PART_BYTES,
      asset.bytes - (part.partNumber - 1) * UPLOAD_PART_BYTES
    )
    if (
      !Number.isSafeInteger(part.partNumber) ||
      part.partNumber < 1 ||
      part.partNumber > count ||
      seen.has(part.partNumber) ||
      part.bytes !== expected ||
      !part.etag
    )
      throw new Error("upload_part_conflict")
    seen.add(part.partNumber)
  }
  return seen
}

export async function prepareFileUpload(
  original: UploadAsset
): Promise<FileUploadAuthorization | null> {
  const { data: active, error: activityError } = await createAdminClient()
    .from("materials")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", original.material_id!)
    .eq("owner_id", original.owner_id)
    .eq("status", "awaiting_upload")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (activityError) throw new Error("upload_activity_unconfirmed")
  if (!active) throw new Error("upload_session_expired")
  if (await objectVerified(original)) return null
  if (original.uploaded_at) throw new Error("upload_object_missing")
  if (original.bytes <= UPLOAD_PART_BYTES)
    return {
      kind: "single",
      ...(await signUpload(original.object_key, original.bytes, original.mime)),
    }
  let asset = multipartId(original)
    ? original
    : await allocateMultipart(original)
  let parts: Awaited<ReturnType<typeof listUploadParts>>
  try {
    parts = await listUploadParts(asset.object_key, multipartId(asset)!)
  } catch (error) {
    if (!storageObjectMissing(error)) throw error
    // Complete may have succeeded before its response was lost. Never replace that object.
    if (await objectVerified(asset)) return null
    const next = { ...metadata(asset) }
    delete next.multipartUploadId
    const { data, error: saveError } = await createAdminClient()
      .from("assets")
      .update({ metadata: next })
      .eq("id", asset.id)
      .eq("owner_id", asset.owner_id)
      .is("uploaded_at", null)
      .eq("metadata", JSON.stringify(asset.metadata))
      .select("*")
      .maybeSingle()
    if (saveError || !data) throw new Error("upload_session_changed")
    asset = await allocateMultipart(data)
    parts = await listUploadParts(asset.object_key, multipartId(asset)!)
  }
  const completed = checkedParts(asset, parts)
  const missing = Array.from(
    { length: Math.ceil(asset.bytes / UPLOAD_PART_BYTES) },
    (_, i) => i + 1
  ).filter((i) => !completed.has(i))
  return {
    kind: "multipart",
    partBytes: UPLOAD_PART_BYTES,
    completedBytes: parts.reduce((sum, part) => sum + part.bytes, 0),
    parts: await Promise.all(
      missing.map(async (partNumber) => {
        const bytes = Math.min(
          UPLOAD_PART_BYTES,
          asset.bytes - (partNumber - 1) * UPLOAD_PART_BYTES
        )
        return {
          partNumber,
          bytes,
          url: await signUploadPart(
            asset.object_key,
            multipartId(asset)!,
            partNumber,
            bytes
          ),
        }
      })
    ),
  }
}

export async function finishFileUpload(asset: UploadAsset): Promise<void> {
  if (await objectVerified(asset)) return
  const id = multipartId(asset)
  if (!id || asset.uploaded_at) throw new Error("upload_incomplete")
  const parts = await listUploadParts(asset.object_key, id).catch(
    async (error) => {
      if (storageObjectMissing(error) && (await objectVerified(asset)))
        return null
      throw error
    }
  )
  if (!parts) return
  if (
    checkedParts(asset, parts).size !==
    Math.ceil(asset.bytes / UPLOAD_PART_BYTES)
  )
    throw new Error("upload_incomplete")
  try {
    await completeMultipartUpload(
      asset.object_key,
      id,
      parts.sort((a, b) => a.partNumber - b.partNumber)
    )
  } catch (error) {
    if (!storageObjectMissing(error) || !(await objectVerified(asset)))
      throw error
  }
  if (!(await objectVerified(asset))) throw new Error("upload_incomplete")
}
