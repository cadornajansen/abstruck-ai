import "server-only"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  ) {
    throw new Error("File storage configuration is missing.")
  }
  return {
    bucket: R2_BUCKET,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
  }
}

export async function signUpload(
  key: string,
  bytes: number,
  mime = "application/pdf"
) {
  const { client, bucket } = storage()
  const headers = { "Content-Type": mime, "If-None-Match": "*" }
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mime,
      ContentLength: bytes,
      // An upload URL must not overwrite a file after completion was verified.
      IfNoneMatch: "*",
    }),
    {
      expiresIn: 900,
      signableHeaders: new Set([
        "content-type",
        "content-length",
        "if-none-match",
      ]),
    }
  )
  return {
    url,
    headers,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  }
}

export async function inspectObject(key: string) {
  const { client, bucket } = storage()
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
}

export function storageObjectMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (("name" in error &&
      ["NoSuchKey", "NotFound", "NoSuchUpload"].includes(String(error.name))) ||
      ("$metadata" in error &&
        (error.$metadata as { httpStatusCode?: number })?.httpStatusCode ===
          404))
  )
}

export async function createMultipartUpload(
  key: string,
  mime: string
): Promise<string> {
  const { client, bucket } = storage()
  try {
    const result = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mime,
      }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
    if (!result.UploadId) throw new Error("upload_session_missing")
    return result.UploadId
  } finally {
    client.destroy()
  }
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string
): Promise<void> {
  const { client, bucket } = storage()
  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
  } catch (error) {
    if (!storageObjectMissing(error)) throw error
  } finally {
    client.destroy()
  }
}

export async function listUploadParts(key: string, uploadId: string) {
  const { client, bucket } = storage()
  try {
    // The 250 MB admission bound permits at most 30 eight-MiB parts.
    const result = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MaxParts: 100,
      }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
    if (result.IsTruncated) throw new Error("upload_parts_limit")
    return (result.Parts ?? []).map((part) => ({
      partNumber: part.PartNumber!,
      bytes: part.Size!,
      etag: part.ETag!,
    }))
  } finally {
    client.destroy()
  }
}

export async function signUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
  bytes: number
): Promise<string> {
  const { client, bucket } = storage()
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: bytes,
    }),
    { expiresIn: 900, signableHeaders: new Set(["content-length"]) }
  )
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  const { client, bucket } = storage()
  try {
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
        },
      }),
      { abortSignal: AbortSignal.timeout(60_000) }
    )
  } finally {
    client.destroy()
  }
}

export async function saveTextSource(
  key: string,
  text: string,
  sha256: string
): Promise<void> {
  const { client, bucket } = storage()
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: text,
        ContentType: "text/plain; charset=utf-8",
        Metadata: { sha256 },
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("$metadata" in error) ||
      (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 412
    )
      throw error
    // A lost response may follow a successful write. Verify the immutable source before resuming.
    const existing = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    )
    if (
      existing.ContentLength !== Buffer.byteLength(text) ||
      existing.Metadata?.sha256 !== sha256
    )
      throw new Error("text_source_conflict")
  } finally {
    client.destroy()
  }
}

export async function signRead(key: string, mime = "application/pdf") {
  const { client, bucket } = storage()
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: mime,
      ResponseContentDisposition: "inline",
      ResponseCacheControl: "private, no-store",
    }),
    { expiresIn: 300 }
  )
}

export async function putSpaceCover(key: string, data: Buffer): Promise<void> {
  const { client, bucket } = storage()
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: "image/webp",
        ContentLength: data.byteLength,
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(15_000) }
    )
  } finally {
    client.destroy()
  }
}

export async function deleteSpaceCover(key: string): Promise<void> {
  const { client, bucket } = storage()
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15_000),
    })
  } finally {
    client.destroy()
  }
}
