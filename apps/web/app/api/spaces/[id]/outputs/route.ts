import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view your saved work." },
      { status: 401 }
    )
  const { id } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return Response.json({ error: "Space not found." }, { status: 404 })
  const db = await createClient()
  const { data: space, error: spaceError } = await db
    .from("spaces")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()
  if (spaceError)
    return Response.json(
      { error: "Your space could not be loaded." },
      { status: 503 }
    )
  if (!space)
    return Response.json({ error: "Space not found." }, { status: 404 })
  const { data, error } = await db
    .from("study_sets")
    .select("id,title,type,status")
    .eq("space_id", id)
    .eq("owner_id", user.id)
    .in("type", ["notes", "summary", "flashcards", "quiz", "exam"])
    .or("status.eq.ready,type.eq.notes")
    .order("updated_at", { ascending: false })
    .limit(100)
  if (error)
    return Response.json(
      { error: "Your saved work could not be loaded. Try again." },
      { status: 503 }
    )
  return Response.json(
    { outputs: data },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
