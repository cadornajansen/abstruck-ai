import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { createFolder, getFolders, OrganisationError } from "@/lib/organisation"
import {
  organisationFailure,
  organisationHeaders,
  organisationInput,
  organisationUuid,
} from "@/lib/organisation-api"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }

export async function GET(
  _request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to view folders." }, { status: 401 })
  const { id } = await params
  try {
    if (!organisationUuid.test(id))
      throw new OrganisationError(404, "Space not found.")
    const db = await createClient()
    const { data } = await db
      .from("spaces")
      .select("id")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle()
    if (!data) throw new OrganisationError(404, "Space not found.")
    return Response.json(
      { folders: await getFolders(user.id, id) },
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}

export async function POST(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to create a folder." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const { requestId, title } = await organisationInput(request)
    if (
      !organisationUuid.test(id) ||
      typeof requestId !== "string" ||
      !organisationUuid.test(requestId) ||
      (title != null &&
        (typeof title !== "string" ||
          !title.trim() ||
          title.trim().length > 120))
    )
      throw new OrganisationError(
        400,
        "Enter a folder name of up to 120 characters."
      )
    return Response.json(
      {
        folder: await createFolder(
          user.id,
          id,
          requestId,
          typeof title === "string" ? title.trim() : undefined
        ),
      },
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}
