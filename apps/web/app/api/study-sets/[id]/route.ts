import { getCurrentUser } from "@/lib/auth/session"
import { getStudySetDetail, saveManualNotes } from "@/lib/study-sets"

export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  try {
    const detail = await getStudySetDetail(user.id, id)
    return detail
      ? Response.json(detail, { headers })
      : Response.json(
          { error: "Study set not found." },
          { status: 404, headers }
        )
  } catch {
    return Response.json(
      { error: "This study set could not be loaded. Please try again." },
      { status: 503, headers }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    !("title" in body) ||
    !("content" in body) ||
    !("revision" in body)
  )
    return Response.json(
      { error: "Include the note title, content and saved revision." },
      { status: 400 }
    )
  const { title, content, revision } = body
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 240 ||
    typeof content !== "string" ||
    content.length > 100000 ||
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision >= 2147483647
  )
    return Response.json(
      {
        error:
          "Your note or revision is invalid. Keep the title under 240 characters and content under 100,000 characters.",
      },
      { status: 400 }
    )
  try {
    const result = await saveManualNotes(
      user.id,
      id,
      title.trim(),
      content,
      revision
    )
    if (result.kind === "not_found")
      return Response.json(
        { error: "Study set not found." },
        { status: 404, headers }
      )
    if (result.kind === "not_notes")
      return Response.json(
        { error: "Only manual notes can be edited here." },
        { status: 400, headers }
      )
    if (result.kind === "conflict")
      return Response.json(
        {
          error:
            "A newer version of this note was saved. Review it before merging your changes.",
          studySet: result.studySet,
        },
        { status: 409, headers }
      )
    return Response.json({ studySet: result.studySet }, { headers })
  } catch {
    return Response.json(
      { error: "Your note could not be saved. Keep your draft and try again." },
      { status: 503, headers }
    )
  }
}
