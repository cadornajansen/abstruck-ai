"use client"

import { youtubeSource } from "@/lib/youtube"
import {
  fileUploadLimit,
  UPLOAD_PART_BYTES,
  type FileUploadAuthorization,
  type UploadOptions,
} from "@/lib/file-upload"

export async function importYouTube(
  url: string,
  spaceId: string | null,
  folderId: string | null = null
): Promise<{ materialId: string }> {
  const source = youtubeSource(url)
  if (!source) throw new Error("Paste one public YouTube video link.")
  const locationKey = folderId ? `${spaceId}:folder:${folderId}` : spaceId
  const resumeKey = `abstruck:youtube:${locationKey}:${source.videoId}`
  let requestId: string = crypto.randomUUID()
  try {
    requestId = localStorage.getItem(resumeKey) ?? requestId
    localStorage.setItem(resumeKey, requestId)
  } catch {
    /* Import works without optional browser storage. */
  }
  const response = await fetch("/api/materials/youtube", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: source.url, spaceId, folderId, requestId }),
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error ?? "This video could not be added.")
  try {
    localStorage.removeItem(resumeKey)
  } catch {
    /* Optional resume metadata. */
  }
  return { materialId: result.materialId }
}

export async function importPastedText(
  text: string,
  spaceId: string | null,
  folderId: string | null = null
): Promise<{ materialId: string }> {
  const source = text.replace(/\r\n?/g, "\n").trim()
  const encoded = new TextEncoder().encode(source)
  if (!source || encoded.byteLength > 100_000)
    throw new Error("Paste text up to 100 KB.")
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
  const locationKey = folderId ? `${spaceId}:folder:${folderId}` : spaceId
  const resumeKey = `abstruck:text:${locationKey}:${hash}`
  let requestId: string = crypto.randomUUID()
  try {
    requestId = localStorage.getItem(resumeKey) ?? requestId
    localStorage.setItem(resumeKey, requestId)
  } catch {
    /* Import works without optional browser storage. */
  }
  const response = await fetch("/api/materials/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: source, spaceId, folderId, requestId }),
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error ?? "Your text could not be added.")
  try {
    localStorage.removeItem(resumeKey)
  } catch {
    /* Optional resume metadata. */
  }
  return { materialId: result.materialId }
}

export async function uploadMaterial(
  file: File,
  spaceId: string | null,
  folderId: string | null = null,
  options: UploadOptions = {}
): Promise<{ materialId: string }> {
  if (
    !/\.(pdf|docx|pptx|mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(file.name) ||
    file.size > fileUploadLimit(file.name) ||
    file.size === 0
  ) {
    throw new Error(
      "Choose a document up to 50 MB, or audio/video up to 250 MB."
    )
  }
  const locationKey = folderId ? `${spaceId}:folder:${folderId}` : spaceId
  // Hash bounded chunks instead of allocating a second copy of a large file.
  // The root of those digests identifies the complete file, not just its name/size.
  const hashes: Uint8Array[] = []
  for (let start = 0; start < file.size; start += UPLOAD_PART_BYTES) {
    options.signal?.throwIfAborted()
    const chunk = await file
      .slice(start, start + UPLOAD_PART_BYTES)
      .arrayBuffer()
    hashes.push(new Uint8Array(await crypto.subtle.digest("SHA-256", chunk)))
    options.onProgress?.({
      phase: "checking",
      uploadedBytes: Math.min(start + UPLOAD_PART_BYTES, file.size),
      totalBytes: file.size,
    })
  }
  const hashBytes = new Uint8Array(hashes.length * 32)
  hashes.forEach((hash, index) => hashBytes.set(hash, index * 32))
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", hashBytes)),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("")
  const transcriptionLanguage = /\.(mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(
    file.name
  )
    ? (options.transcriptionLanguage ?? "auto")
    : "auto"
  const languageKey =
    transcriptionLanguage === "auto" ? "" : `:${transcriptionLanguage}`
  const resumeKey = `abstruck:upload:v2:${locationKey}:${file.name}:${file.size}:${fingerprint}${languageKey}`
  let requestId = crypto.randomUUID() as string
  try {
    requestId = localStorage.getItem(resumeKey) ?? requestId
    localStorage.setItem(resumeKey, requestId)
  } catch {
    /* Upload still works without browser storage. */
  }
  async function openSession(): Promise<{
    materialId: string
    upload: FileUploadAuthorization | null
  }> {
    const response = await fetch("/api/materials/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        fileName: file.name,
        size: file.size,
        spaceId,
        folderId,
        requestId,
        fingerprint,
        transcriptionLanguage,
      }),
    })
    const session = await response.json()
    if (!response.ok)
      throw new Error(session.error ?? "Upload could not start.")
    return session
  }
  const session = await openSession()
  if (session.upload) {
    options.onProgress?.({
      phase: "uploading",
      uploadedBytes:
        session.upload.kind === "multipart" ? session.upload.completedBytes : 0,
      totalBytes: file.size,
    })
    if (session.upload.kind === "single") {
      const upload = await fetch(session.upload.url, {
        method: "PUT",
        headers: session.upload.headers,
        body: file,
        signal: options.signal,
      })
      // The previous attempt may have uploaded before the browser closed.
      if (!upload.ok && upload.status !== 412)
        throw new Error(
          "Upload was interrupted. Choose the same file to resume."
        )
    } else {
      let completedBytes = session.upload.completedBytes
      for (const part of session.upload.parts) {
        options.signal?.throwIfAborted()
        const chunk = file.slice(
          (part.partNumber - 1) * UPLOAD_PART_BYTES,
          (part.partNumber - 1) * UPLOAD_PART_BYTES + part.bytes
        )
        let upload = await fetch(part.url, {
          method: "PUT",
          body: chunk,
          signal: options.signal,
        })
        if (upload.status === 403) {
          const refreshed = await openSession()
          if (refreshed.materialId !== session.materialId)
            throw new Error("Upload changed. Select the same file again.")
          const freshPart =
            refreshed.upload?.kind === "multipart"
              ? refreshed.upload.parts.find(
                  (value) => value.partNumber === part.partNumber
                )
              : null
          if (freshPart)
            upload = await fetch(freshPart.url, {
              method: "PUT",
              body: chunk,
              signal: options.signal,
            })
          else if (!refreshed.upload || refreshed.upload.kind === "multipart") {
            completedBytes += part.bytes
            options.onProgress?.({
              phase: "uploading",
              uploadedBytes: completedBytes,
              totalBytes: file.size,
            })
            continue
          }
        }
        if (!upload.ok)
          throw new Error(
            "Upload was interrupted. Add the same file to resume its saved parts."
          )
        completedBytes += part.bytes
        options.onProgress?.({
          phase: "uploading",
          uploadedBytes: completedBytes,
          totalBytes: file.size,
        })
      }
    }
  }
  options.onProgress?.({
    phase: "confirming",
    uploadedBytes: file.size,
    totalBytes: file.size,
  })
  const completion = await fetch(
    `/api/materials/${session.materialId}/complete`,
    { method: "POST", signal: options.signal }
  )
  const result = await completion.json()
  if (!completion.ok)
    throw new Error(result.error ?? "The upload could not be confirmed.")
  try {
    localStorage.removeItem(resumeKey)
  } catch {
    /* Optional resume metadata. */
  }
  return { materialId: session.materialId }
}
