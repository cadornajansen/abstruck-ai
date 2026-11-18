import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  ownedUploadAsset,
  prepareFileUpload,
} from "@/lib/material-upload-session"
import { fileUploadLimit } from "@/lib/file-upload"

export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to upload a material." },
      { status: 401 }
    )
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Invalid upload request." }, { status: 415 })
  }
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== "object") throw new Error("invalid_metadata")
    const {
      fileName,
      size,
      spaceId,
      requestId,
      fingerprint,
      folderId = null,
      transcriptionLanguage = "auto",
    } = body as Record<string, unknown>
    if (
      typeof fileName !== "string" ||
      fileName.length > 240 ||
      !/\.(pdf|docx|pptx|mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(fileName) ||
      typeof size !== "number" ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > fileUploadLimit(fileName) ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      typeof requestId !== "string" ||
      !uuid.test(requestId) ||
      (transcriptionLanguage !== "auto" &&
        transcriptionLanguage !== "en" &&
        transcriptionLanguage !== "tl") ||
      (transcriptionLanguage !== "auto" &&
        /\.(pdf|docx|pptx)$/i.test(fileName)) ||
      (spaceId !== null &&
        (typeof spaceId !== "string" || !uuid.test(spaceId))) ||
      (folderId !== null &&
        (typeof folderId !== "string" ||
          !uuid.test(folderId) ||
          spaceId === null))
    ) {
      return Response.json(
        {
          error: "Choose a document up to 50 MB, or audio/video up to 250 MB.",
        },
        { status: 400 }
      )
    }
    const db = createAdminClient()
    const sourceType = fileName.toLowerCase().split(".").at(-1)!
    const { data: material, error } = await db.rpc(
      "reserve_file_material_upload",
      {
        p_owner_id: user.id,
        p_space_id: spaceId as string,
        p_folder_id: folderId as string,
        p_request_id: requestId,
        p_title: fileName,
        p_bytes: size,
        p_extension: sourceType,
        p_fingerprint: fingerprint,
      }
    )
    if (error) {
      const quota = error.message.includes("storage_quota_exceeded")
      const missingFolder = error.message.includes("folder_not_found")
      const conflict = error.message.includes("request_conflict")
      return Response.json(
        {
          error: quota
            ? "Your storage allowance is full."
            : conflict
              ? "This upload belongs to a different file. Choose the original file to resume."
              : missingFolder
                ? "This folder is no longer available. Choose another destination before uploading."
                : "This upload could not be started.",
        },
        { status: quota ? 429 : conflict ? 409 : missingFolder ? 404 : 400 }
      )
    }
    let asset = await ownedUploadAsset(material.id, user.id)
    if (!asset || asset.bytes !== size) {
      return Response.json(
        {
          error:
            "This upload belongs to a different file. Please select it again.",
        },
        { status: 409 }
      )
    }
    const metadata =
      asset.metadata &&
      typeof asset.metadata === "object" &&
      !Array.isArray(asset.metadata)
        ? asset.metadata
        : {}
    const savedLanguage = metadata.transcriptionLanguage
    if (
      (savedLanguage != null && savedLanguage !== transcriptionLanguage) ||
      (savedLanguage == null &&
        material.status !== "awaiting_upload" &&
        transcriptionLanguage !== "auto")
    )
      return Response.json(
        {
          error:
            "This upload uses a different audio language. Start it again with the same language.",
        },
        { status: 409 }
      )
    if (savedLanguage == null && material.status === "awaiting_upload") {
      const saved = await db
        .from("assets")
        .update({ metadata: { ...metadata, transcriptionLanguage } })
        .eq("id", asset.id)
        .eq("owner_id", user.id)
        .is("uploaded_at", null)
        .eq("metadata", JSON.stringify(asset.metadata))
        .select("*")
        .maybeSingle()
      if (saved.error) throw saved.error
      if (!saved.data)
        return Response.json(
          {
            error:
              "This upload changed. Choose the same file and language to resume.",
          },
          { status: 409 }
        )
      asset = saved.data
    }
    const upload =
      material.status === "awaiting_upload"
        ? await prepareFileUpload(asset)
        : null
    return Response.json(
      { materialId: material.id, status: material.status, upload },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json(
      { error: "Upload is temporarily unavailable. Please try again." },
      { status: 503 }
    )
  }
}
