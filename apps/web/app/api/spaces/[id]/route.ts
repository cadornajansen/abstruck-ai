import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import type { TablesUpdate } from "@/lib/supabase/database.types"
import { isSpaceIconName } from "@/lib/space-appearance"
import { organisationInput, validRevision } from "@/lib/organisation-api"

type SpaceContext = { params: Promise<{ id: string }> }
const validId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request, { params }: SpaceContext) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to edit your space." },
      { status: 401 }
    )
  const { id } = await params
  if (!validId.test(id))
    return Response.json({ error: "Space not found." }, { status: 404 })
  let body: Record<string, unknown>
  try {
    body = await organisationInput(request, 8192)
  } catch {
    return Response.json(
      { error: "Check the space details and try again." },
      { status: 400 }
    )
  }
  if (
    !validRevision(body.revision) ||
    Object.keys(body).some(
      (key) => !["title", "description", "icon", "revision"].includes(key)
    )
  )
    return Response.json(
      { error: "Reload the space details and try again." },
      { status: 400 }
    )
  const changes: TablesUpdate<"spaces"> = {}
  if ("title" in body) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 120
    )
      return Response.json(
        { error: "Use 1–120 characters for the name." },
        { status: 400 }
      )
    changes.title = body.title.trim()
  }
  if ("description" in body) {
    if (
      typeof body.description !== "string" ||
      body.description.trim().length > 1000
    )
      return Response.json(
        { error: "Use up to 1,000 characters for the description." },
        { status: 400 }
      )
    changes.description = body.description.trim() || null
  }
  if ("icon" in body) {
    const icon = body.icon
    if (icon === null) {
      changes.icon_name = null
      changes.icon_color = null
    } else if (
      typeof icon === "object" &&
      icon &&
      "name" in icon &&
      isSpaceIconName(icon.name) &&
      "color" in icon &&
      typeof icon.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(icon.color)
    ) {
      changes.icon_name = icon.name
      changes.icon_color = icon.color.toUpperCase()
    } else
      return Response.json(
        { error: "Choose an icon and a six-digit color." },
        { status: 400 }
      )
  }
  if (!Object.keys(changes).length)
    return Response.json(
      { error: "Choose a detail to update." },
      { status: 400 }
    )
  changes.updated_at = new Date().toISOString()
  changes.details_revision = body.revision + 1
  const db = await createClient()
  const { data, error } = await db
    .from("spaces")
    .update(changes)
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("details_revision", body.revision)
    .select("id,title,description,icon_name,icon_color,details_revision")
    .maybeSingle()
  if (error)
    return Response.json(
      { error: "Your space could not be saved. Try again." },
      { status: 503 }
    )
  if (!data) {
    const current = await db
      .from("spaces")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle()
    return Response.json(
      {
        error: current.data
          ? "This space changed in another tab. Reload before saving again."
          : "Space not found.",
      },
      { status: current.data ? 409 : 404 }
    )
  }
  revalidatePath("/", "layout")
  return Response.json(
    {
      id: data.id,
      space: {
        id: data.id,
        title: data.title,
        description: data.description,
        iconName: data.icon_name,
        iconColor: data.icon_color,
        detailsRevision: data.details_revision,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function DELETE(_request: Request, { params }: SpaceContext) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to delete your space." },
      { status: 401 }
    )
  const { id } = await params
  if (!validId.test(id))
    return Response.json({ error: "Space not found." }, { status: 404 })
  const db = await createClient()
  // Existing foreign keys unfile materials and study sets atomically; their data stays intact.
  const { data, error } = await db
    .from("spaces")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle()
  if (error)
    return Response.json(
      { error: "Your space could not be deleted. Try again." },
      { status: 503 }
    )
  if (!data)
    return Response.json({ error: "Space not found." }, { status: 404 })
  revalidatePath("/", "layout")
  return Response.json(
    { id: data.id },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
