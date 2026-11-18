import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to start a chat." }, { status: 401 })
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    return Response.json(
      { error: "The chat request is invalid." },
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
      if (bytes > 16_384) {
        await reader.cancel()
        return Response.json(
          { error: "Ask a question of up to 2,000 characters." },
          { status: 413 }
        )
      }
      chunks.push(next.value)
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new SyntaxError()
    const {
      question,
      requestId,
      sourceIds = [],
    } = body as Record<string, unknown>
    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 2000 ||
      typeof requestId !== "string" ||
      !uuid.test(requestId) ||
      !Array.isArray(sourceIds) ||
      sourceIds.length > 3 ||
      sourceIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
      new Set(sourceIds).size !== sourceIds.length
    )
      return Response.json(
        {
          error:
            "Ask a question of up to 2,000 characters and choose up to three ready materials.",
        },
        { status: 400 }
      )
    const saved = await createAdminClient().rpc("create_standalone_chat", {
      p_owner_id: user.id,
      p_request_id: requestId,
      p_question: question.trim(),
      p_source_ids: sourceIds as string[],
    })
    if (saved.error)
      return Response.json(
        {
          error: saved.error.message.includes("source_unavailable")
            ? "A selected source is unavailable. Choose your materials again."
            : "This chat could not be saved. Keep your question and try again.",
        },
        { status: 409 }
      )
    return Response.json(saved.data, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "The chat request is invalid."
            : "This chat could not be saved. Keep your question and try again.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 }
    )
  } finally {
    reader.releaseLock()
  }
}
