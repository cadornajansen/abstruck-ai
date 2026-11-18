import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { OrganisationError } from "@/lib/organisation"
import {
  organisationFailure,
  organisationHeaders,
  organisationInput,
  organisationUuid,
} from "@/lib/organisation-api"

export const runtime = "nodejs"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to pin a space." }, { status: 401 })
  try {
    const { id } = await params
    const { pinned } = await organisationInput(request)
    if (!organisationUuid.test(id) || typeof pinned !== "boolean")
      throw new OrganisationError(400, "Choose a space and its pinned state.")
    const { data, error } = await createAdminClient().rpc("pin_space", {
      p_owner_id: user.id,
      p_space_id: id,
      p_pinned: pinned,
    })
    if (error || !data || typeof data !== "object" || Array.isArray(data))
      throw new Error("pin_unavailable")
    if (data.status === "not_found")
      throw new OrganisationError(404, "Space not found.")
    if (data.status !== "ok")
      throw new OrganisationError(400, "The pinned state could not be saved.")
    revalidatePath("/", "layout")
    return Response.json(
      { space: data.space },
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}
