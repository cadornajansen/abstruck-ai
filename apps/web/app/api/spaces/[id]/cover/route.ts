import { Buffer } from "node:buffer"
import { createHash, randomUUID } from "node:crypto"
import sharp from "sharp"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deleteSpaceCover, putSpaceCover, signRead } from "@/lib/storage/r2"
import { organisationUuid, validRevision } from "@/lib/organisation-api"
import { SPACE_COVER_BYTES } from "@/lib/space-appearance"

type Context = { params: Promise<{ id: string }> }
const headers = { "Cache-Control": "private, no-store" }
function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers })
}
async function access(context: Context) {
  const user = await getCurrentUser()
  if (!user)
    return { response: fail("Sign in to change your space.", 401) } as const
  const { id } = await context.params
  if (!organisationUuid.test(id))
    return { response: fail("Space not found.", 404) } as const
  const db = await createClient()
  const result = await db
    .from("spaces")
    .select("id,details_revision")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()
  if (result.error)
    return { response: fail("Your space could not be loaded.", 503) } as const
  if (!result.data) return { response: fail("Space not found.", 404) } as const
  return { user, db, space: result.data } as const
}
async function clean(key?: string | null): Promise<void> {
  if (!key) return
  try {
    await deleteSpaceCover(key)
  } catch {
    /* Private object cleanup can be retried separately. */
  }
}
export async function GET(
  _request: Request,
  context: Context
): Promise<Response> {
  const allowed = await access(context)
  if (allowed.response) return allowed.response
  const { data, error } = await allowed.db
    .from("assets")
    .select("object_key")
    .eq("space_id", allowed.space.id)
    .eq("owner_id", allowed.user.id)
    .eq("role", "space_cover")
    .not("uploaded_at", "is", null)
    .maybeSingle()
  if (error) return fail("Cover is temporarily unavailable.", 503)
  if (!data) return fail("Cover not found.", 404)
  try {
    return new Response(null, {
      status: 307,
      headers: {
        ...headers,
        Location: await signRead(data.object_key, "image/webp"),
      },
    })
  } catch {
    return fail("Cover is temporarily unavailable.", 503)
  }
}
async function change(
  request: Request,
  context: Context,
  remove: boolean
): Promise<Response> {
  const allowed = await access(context)
  if (allowed.response) return allowed.response
  const revision = Number(request.headers.get("X-Space-Revision"))
  if (
    request.headers.get("X-Space-Revision") === null ||
    !validRevision(revision)
  )
    return fail("Reload the space details and try again.", 400)
  if (revision !== allowed.space.details_revision)
    return fail(
      "This space changed in another tab. Reload before saving again.",
      409
    )
  let data: Buffer | null = null
  if (!remove) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(
        request.headers.get("Content-Type") ?? ""
      )
    )
      return fail("Choose a JPG, PNG or WebP image up to 2 MB.", 415)
    if (
      !request.body ||
      Number(request.headers.get("Content-Length")) > SPACE_COVER_BYTES
    )
      return fail("Choose an image up to 2 MB.", 413)
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = []
    let length = 0
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        length += next.value.byteLength
        if (length > SPACE_COVER_BYTES) {
          await reader.cancel()
          return fail("Choose an image up to 2 MB.", 413)
        }
        chunks.push(next.value)
      }
      const input = sharp(Buffer.concat(chunks), {
        limitInputPixels: 16_000_000,
        failOn: "warning",
      })
      const meta = await input.metadata()
      if (
        !["jpeg", "png", "webp"].includes(meta.format ?? "") ||
        (meta.pages ?? 1) !== 1
      )
        return fail("Choose a still JPG, PNG or WebP image.", 400)
      data = await input
        .autoOrient()
        .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      if (data.byteLength > SPACE_COVER_BYTES)
        return fail("This image is too detailed. Choose a smaller image.", 413)
    } catch {
      return fail(
        "This image could not be read. Choose a different image.",
        400
      )
    } finally {
      reader.releaseLock()
    }
  }
  const key = data
    ? `${allowed.user.id}/spaces/${allowed.space.id}/${randomUUID()}.webp`
    : null
  try {
    if (data && key) await putSpaceCover(key, data)
    const result = await createAdminClient().rpc("set_space_cover", {
      p_owner_id: allowed.user.id,
      p_space_id: allowed.space.id,
      p_revision: revision,
      // SQL accepts null for removal; generated RPC parameter types do not express it.
      p_object_key: key!,
      p_bytes: data?.byteLength ?? 0,
      p_sha256: data ? createHash("sha256").update(data).digest("hex") : null!,
    })
    if (result.error) {
      // Only a definite database rejection proves this file was not published.
      if (result.error.code === "P0001") await clean(key)
      if (result.error.message.includes("space_revision_conflict"))
        return fail(
          "This space changed in another tab. Reload before saving again.",
          409
        )
      if (result.error.message.includes("storage_quota_exceeded"))
        return fail(
          "Your storage is full. Remove a file or upgrade before adding a cover.",
          429
        )
      if (result.error.message.includes("space_not_found"))
        return fail("Space not found.", 404)
      return fail("Your cover could not be saved. Try again.", 503)
    }
    const published = result.data as {
      revision: number
      previousKey: string | null
    }
    await clean(published.previousKey)
    revalidatePath("/", "layout")
    return Response.json(
      { revision: published.revision, hasCover: !remove },
      { headers }
    )
  } catch {
    // A lost database reply may follow a committed change. Keep its private object.
    return fail("Your cover could not be saved. Try again.", 503)
  }
}
export async function POST(
  request: Request,
  context: Context
): Promise<Response> {
  return change(request, context, false)
}
export async function DELETE(
  request: Request,
  context: Context
): Promise<Response> {
  return change(request, context, true)
}
