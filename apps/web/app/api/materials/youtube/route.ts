import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { youtubeSource } from "@/lib/youtube"

export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to add a material." },
      { status: 401 }
    )
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    return Response.json(
      { error: "The YouTube import request is invalid." },
      { status: 400 }
    )
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 4096) {
        await reader.cancel()
        return Response.json(
          { error: "The YouTube link is too long." },
          { status: 413 }
        )
      }
      chunks.push(next.value)
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new SyntaxError()
    const {
      url,
      spaceId,
      requestId,
      folderId = null,
    } = input as Record<string, unknown>
    const source =
      typeof url === "string" && url.length <= 2048 ? youtubeSource(url) : null
    if (
      !source ||
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
        {
          error:
            "Paste one public YouTube video link. Playlists and live streams are not supported.",
        },
        { status: 400 }
      )
    const db = createAdminClient()
    const metadata = {
      p_owner_id: user.id,
      p_space_id: spaceId as string,
      p_request_id: requestId,
      p_video_id: source.videoId,
    }
    const queued =
      folderId !== null
        ? await db.rpc("reserve_material_in_folder", {
            ...metadata,
            p_folder_id: folderId as string,
            p_kind: "youtube",
          })
        : await db.rpc("reserve_youtube_material", metadata)
    if (queued.error) {
      const busy = queued.error.message.includes("concurrent_job_limit")
      const missingFolder = queued.error.message.includes("folder_not_found")
      return Response.json(
        {
          error: busy
            ? "Wait for your current study job to finish, then add this link again."
            : missingFolder
              ? "This folder is no longer available. Choose another destination before adding the link."
              : "This video could not be added. Check the space and try again.",
        },
        { status: busy ? 429 : 409 }
      )
    }
    return Response.json(
      { materialId: queued.data.id, status: queued.data.status },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "The YouTube import request is invalid."
            : "This video could not be added. Keep the link and try again.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 }
    )
  } finally {
    reader.releaseLock()
  }
}
