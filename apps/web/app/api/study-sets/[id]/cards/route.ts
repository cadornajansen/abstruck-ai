import { getCurrentUser } from "@/lib/auth/session"
import { getStudySet, getStudySetDetail } from "@/lib/study-sets"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers }
    )
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !uuid.test(id) ||
    !body ||
    typeof body !== "object" ||
    !("cardId" in body) ||
    typeof body.cardId !== "string" ||
    !uuid.test(body.cardId)
  ) {
    return Response.json(
      { error: "Choose a valid flashcard." },
      { status: 400, headers }
    )
  }
  const starring = "starred" in body
  if (
    starring &&
    (typeof body.starred !== "boolean" || "front" in body || "back" in body)
  ) {
    return Response.json(
      { error: "Save the star preference separately from card edits." },
      { status: 400, headers }
    )
  }
  if (
    !starring &&
    (!("front" in body) ||
      typeof body.front !== "string" ||
      !body.front.trim() ||
      body.front.trim().length > 2000 ||
      !("back" in body) ||
      typeof body.back !== "string" ||
      !body.back.trim() ||
      body.back.trim().length > 5000 ||
      ("explanation" in body &&
        (typeof body.explanation !== "string" ||
          body.explanation.length > 5000)) ||
      !("revision" in body) ||
      typeof body.revision !== "number" ||
      !Number.isInteger(body.revision) ||
      body.revision < 0 ||
      body.revision >= 2147483647)
  ) {
    return Response.json(
      {
        error:
          "Include front and back text and the saved revision. Keep the front under 2,000 characters and the back and explanation under 5,000 each.",
      },
      { status: 400, headers }
    )
  }
  try {
    const db = createAdminClient()
    const result = starring
      ? await db.rpc("star_flashcard", {
          p_owner_id: user.id,
          p_study_set_id: id,
          p_card_id: body.cardId,
          p_starred: (body as { starred: boolean }).starred,
        })
      : await db.rpc("edit_flashcard", {
          p_owner_id: user.id,
          p_study_set_id: id,
          p_card_id: body.cardId,
          p_front: (body as { front: string }).front.trim(),
          p_back: (body as { back: string }).back.trim(),
          p_explanation: "explanation" in body ? String(body.explanation) : "",
          p_revision: (body as { revision: number }).revision,
        })
    if (result.error || !result.data) throw new Error("Card save failed")
    if (
      typeof result.data === "object" &&
      !Array.isArray(result.data) &&
      "error" in result.data
    ) {
      const code = result.data.error
      if (code === "revision_conflict")
        return Response.json(
          {
            error:
              "This deck changed. Keep your draft and reload the latest deck before saving.",
            studySet: await getStudySet(user.id, id),
          },
          { status: 409, headers }
        )
      const status =
        code === "not_found" ? 404 : code === "not_ready" ? 409 : 400
      return Response.json(
        {
          error:
            code === "not_found"
              ? "Deck not found."
              : "This card is no longer available for editing. Reload the deck and try again.",
        },
        { status, headers }
      )
    }
    if (starring) return Response.json(result.data, { headers })
    const detail = await getStudySetDetail(user.id, id)
    return Response.json(detail, { headers })
  } catch {
    return Response.json(
      { error: "Your card could not be saved. Keep your draft and try again." },
      { status: 503, headers }
    )
  }
}
