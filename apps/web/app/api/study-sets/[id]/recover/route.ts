import { getCurrentUser } from "@/lib/auth/session"
import { getStudySet } from "@/lib/study-sets"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const set = await getStudySet(user.id, id)
  if (!set)
    return Response.json({ error: "Study set not found." }, { status: 404 })
  if (set.status === "ready")
    return Response.json({ studySetId: id, status: "ready" })
  const db = createAdminClient()
  const { data, error } = await db.rpc("recover_study_save", {
    p_owner_id: user.id,
    p_study_set_id: id,
  })
  if (error)
    return Response.json(
      { error: "Saving could not resume. Please try again." },
      { status: 503 }
    )
  if (!data)
    return Response.json(
      {
        error:
          "There is no saved result to recover. You can start a new generation.",
      },
      { status: 409 }
    )
  return Response.json({ studySetId: id, status: "queued" }, { status: 202 })
}
