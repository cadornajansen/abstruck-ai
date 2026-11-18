import { createHash } from "node:crypto"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { saveTextSource } from "@/lib/storage/r2"

export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readInput(request: Request): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    throw new Error("invalid_request")
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      // JSON escaping can expand a 100 KB text source by up to six times.
      if (bytes > 610_000) {
        await reader.cancel()
        throw new Error("text_size_limit")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("invalid_request")
  return input as Record<string, unknown>
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to add a material." },
      { status: 401 }
    )
  try {
    const {
      text,
      spaceId,
      requestId,
      folderId = null,
    } = await readInput(request)
    if (
      typeof text !== "string" ||
      typeof requestId !== "string" ||
      !uuid.test(requestId) ||
      (spaceId !== null &&
        (typeof spaceId !== "string" || !uuid.test(spaceId))) ||
      (folderId !== null &&
        (typeof folderId !== "string" ||
          !uuid.test(folderId) ||
          spaceId === null))
    )
      return Response.json(
        { error: "The text import request is invalid." },
        { status: 400 }
      )
    const source = text.replace(/\r\n?/g, "\n").trim()
    const bytes = Buffer.byteLength(source)
    if (!source || bytes > 100_000 || source.includes("\u0000"))
      return Response.json(
        { error: "Paste readable text up to 100 KB." },
        { status: 400 }
      )
    if (source.split(/\n[\t ]*\n+/).length > 200)
      return Response.json(
        { error: "Keep this material to 200 paragraphs or fewer." },
        { status: 400 }
      )
    const hash = createHash("sha256").update(source).digest("hex")
    const title = source.split("\n")[0]!.replace(/\s+/g, " ").slice(0, 120)
    const db = createAdminClient()
    const metadata = {
      p_owner_id: user.id,
      p_space_id: spaceId as string,
      p_request_id: requestId,
      p_title: title,
      p_bytes: bytes,
      p_sha256: hash,
    }
    const { data: material, error } =
      folderId !== null
        ? await db.rpc("reserve_material_in_folder", {
            ...metadata,
            p_folder_id: folderId as string,
            p_kind: "text",
          })
        : await db.rpc("reserve_text_material", {
            ...metadata,
            p_storage_limit: 100_000_000,
          })
    if (error) {
      const quota = error.message.includes("storage_quota_exceeded")
      const missingFolder = error.message.includes("folder_not_found")
      return Response.json(
        {
          error: quota
            ? "Your storage allowance is full."
            : missingFolder
              ? "This folder is no longer available. Choose another destination before adding the text."
              : "This text could not be saved. Please try again.",
        },
        { status: quota ? 429 : missingFolder ? 404 : 409 }
      )
    }
    if (material.status === "awaiting_upload")
      await saveTextSource(
        `${user.id}/${material.id}/original.txt`,
        source,
        hash
      )
    const queued = await db.rpc("queue_material", {
      p_owner_id: user.id,
      p_material_id: material.id,
      p_retry: true,
    })
    if (queued.error) {
      if (queued.error.message.includes("concurrent_job_limit"))
        return Response.json(
          {
            error:
              "Your text is saved. Wait for your current study job to finish, then add it again to continue.",
          },
          { status: 429 }
        )
      throw new Error("queue_unavailable")
    }
    return Response.json(
      { materialId: material.id, status: queued.data.status },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "invalid_request")
    )
      return Response.json(
        { error: "The text import request is invalid." },
        { status: 400 }
      )
    if (error instanceof Error && error.message === "text_size_limit")
      return Response.json(
        { error: "Paste text up to 100 KB." },
        { status: 413 }
      )
    return Response.json(
      { error: "Your text could not be added. Keep it here and try again." },
      { status: 503 }
    )
  }
}
