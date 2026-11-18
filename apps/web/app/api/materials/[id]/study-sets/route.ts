import { getCurrentUser } from "@/lib/auth/session"
import { getMaterial } from "@/lib/materials"
import { createManualNotes, getMaterialStudySets } from "@/lib/study-sets"

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
  if (!(await getMaterial(id)))
    return Response.json({ error: "Material not found." }, { status: 404 })
  try {
    return Response.json(
      { studySets: await getMaterialStudySets(user.id, id) },
      { headers }
    )
  } catch {
    return Response.json(
      { error: "Your study sets could not be loaded. Please try again." },
      { status: 503, headers }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const material = await getMaterial(id)
  if (!material)
    return Response.json({ error: "Material not found." }, { status: 404 })
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    !("type" in body) ||
    body.type !== "notes"
  )
    return Response.json(
      { error: "Choose notes to create a manual study set." },
      { status: 400 }
    )
  const title = "title" in body ? body.title : "Untitled notes"
  const content = "content" in body ? body.content : ""
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 240 ||
    typeof content !== "string" ||
    content.length > 100000
  )
    return Response.json(
      {
        error:
          "Use a title of 1–240 characters and a note under 100,000 characters.",
      },
      { status: 400 }
    )
  try {
    return Response.json(
      {
        studySet: await createManualNotes(
          user.id,
          material,
          title.trim(),
          content
        ),
      },
      { status: 201, headers }
    )
  } catch {
    return Response.json(
      { error: "Your note could not be created. Please try again." },
      { status: 503, headers }
    )
  }
}
