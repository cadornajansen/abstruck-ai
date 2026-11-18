import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/profile"
import type { User } from "@supabase/supabase-js"

async function responseFor(user: User) {
  const db = await createClient()
  const [profile, { count, error }] = await Promise.all([
    getProfile(user.id),
    db
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id),
  ])
  if (error || !profile)
    return Response.json(
      { error: "Your account could not be loaded." },
      { status: 503 }
    )
  const prefs =
    profile.preferences &&
    typeof profile.preferences === "object" &&
    !Array.isArray(profile.preferences)
      ? profile.preferences
      : {}
  return Response.json(
    {
      profile: {
        name: profile.display_name ?? "",
        email: user.email ?? "",
        createdAt: user.created_at,
        contentCount: count ?? 0,
        school: typeof prefs.school === "string" ? prefs.school : "",
        course: typeof prefs.course === "string" ? prefs.course : "",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
export async function GET() {
  const user = await getCurrentUser()
  return user
    ? responseFor(user)
    : Response.json({ error: "Sign in to view your account." }, { status: 401 })
}
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to edit your account." },
      { status: 401 }
    )
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Invalid profile request." }, { status: 415 })
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid profile request." }, { status: 400 })
  }
  if (
    !body ||
    ["name", "school", "course"].some(
      (key) =>
        typeof body[key] !== "string" || (body[key] as string).length > 100
    )
  ) {
    return Response.json(
      { error: "Use up to 100 characters for each field." },
      { status: 400 }
    )
  }
  const profile = await getProfile(user.id)
  if (!profile)
    return Response.json(
      { error: "Your profile could not be loaded." },
      { status: 503 }
    )
  const existing =
    profile.preferences &&
    typeof profile.preferences === "object" &&
    !Array.isArray(profile.preferences)
      ? profile.preferences
      : {}
  const db = await createClient()
  const { error } = await db
    .from("profiles")
    .update({
      display_name: (body.name as string).trim() || null,
      preferences: {
        ...existing,
        school: (body.school as string).trim(),
        course: (body.course as string).trim(),
      },
    })
    .eq("id", user.id)
  if (error)
    return Response.json(
      { error: "Your profile could not be saved. Please try again." },
      { status: 503 }
    )
  return responseFor(user)
}
