import { getCurrentUser } from "@/lib/auth/session"
import { saveStudyOutput } from "@/lib/study-sets"

export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { "Cache-Control": "private, no-store" }

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to save your work." },
      { status: 401 }
    )
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    return Response.json({ error: "Invalid save request." }, { status: 400 })
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 200000) {
        await reader.cancel()
        return Response.json(
          { error: "This edit is too large." },
          { status: 413 }
        )
      }
      chunks.push(next.value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >
    if (
      !body ||
      typeof body.versionId !== "string" ||
      !uuid.test(body.versionId) ||
      typeof body.revision !== "number" ||
      !Number.isInteger(body.revision) ||
      body.revision < 0 ||
      !body.content ||
      typeof body.content !== "object" ||
      Array.isArray(body.content)
    )
      return Response.json(
        {
          error: "Include the saved version, revision and structured content.",
        },
        { status: 400 }
      )
    const { id } = await params
    const result = await saveStudyOutput(
      user.id,
      id,
      body.versionId,
      body.revision,
      body.content as Record<string, unknown>
    )
    if (result.kind === "not_found")
      return Response.json(
        { error: "Study output not found." },
        { status: 404, headers }
      )
    if (result.kind === "unsupported")
      return Response.json(
        { error: "This output is read-only. Export it to keep a copy." },
        { status: 400, headers }
      )
    if (result.kind === "invalid")
      return Response.json(
        {
          error:
            "Check text lengths and preserve saved IDs and source citations. Numeric values and dates must match the saved evidence.",
        },
        { status: 422, headers }
      )
    if (!("detail" in result))
      return Response.json(
        { error: "Your edit could not be saved." },
        { status: 503, headers }
      )
    return Response.json(
      result.kind === "conflict"
        ? {
            error: "A newer version was saved. Your draft has not replaced it.",
            ...result.detail,
          }
        : result.detail,
      { status: result.kind === "conflict" ? 409 : 200, headers }
    )
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "Invalid save request."
            : "Your edit could not be saved. Keep or export the draft before retrying.",
      },
      { status: error instanceof SyntaxError ? 400 : 503, headers }
    )
  } finally {
    reader.releaseLock()
  }
}
