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

export async function PATCH(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to reorder spaces." },
      { status: 401 }
    )
  try {
    const { pinned, spaceIds } = await organisationInput(request, 24_000)
    if (
      typeof pinned !== "boolean" ||
      !Array.isArray(spaceIds) ||
      spaceIds.length > 500 ||
      !spaceIds.every(
        (id): id is string =>
          typeof id === "string" && organisationUuid.test(id)
      ) ||
      new Set(spaceIds).size !== spaceIds.length
    )
      throw new OrganisationError(
        400,
        "Include each space in this group once, in its new order."
      )
    const { data, error } = await createAdminClient().rpc("reorder_spaces", {
      p_owner_id: user.id,
      p_pinned: pinned,
      p_space_ids: spaceIds,
    })
    if (error || !data || typeof data !== "object" || Array.isArray(data))
      throw new Error("order_unavailable")
    if (data.status === "not_found")
      throw new OrganisationError(404, "A space is no longer available.")
    if (data.status === "conflict")
      throw new OrganisationError(
        409,
        "Your spaces changed. Refresh the sidebar before reordering."
      )
    if (data.status !== "ok")
      throw new OrganisationError(400, "Include each space in this group once.")
    revalidatePath("/", "layout")
    return Response.json(
      { spaces: data.spaces },
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}
