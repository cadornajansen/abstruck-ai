import { getCurrentUser } from "@/lib/auth/session"
import {
  deleteFolder,
  getFolder,
  renameFolder,
  OrganisationError,
} from "@/lib/organisation"
import {
  organisationFailure,
  organisationHeaders,
  organisationInput,
  organisationUuid,
  validRevision,
} from "@/lib/organisation-api"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }

export async function GET(
  _request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view this folder." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const folder = organisationUuid.test(id)
      ? await getFolder(user.id, id)
      : null
    if (!folder) throw new OrganisationError(404, "Folder not found.")
    return Response.json({ folder }, { headers: organisationHeaders })
  } catch (error) {
    return organisationFailure(error)
  }
}

export async function PATCH(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to rename a folder." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const { title, revision } = await organisationInput(request)
    if (
      !organisationUuid.test(id) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120 ||
      !validRevision(revision)
    )
      throw new OrganisationError(
        400,
        "Enter a folder name of up to 120 characters and its saved revision."
      )
    return Response.json(
      { folder: await renameFolder(user.id, id, revision, title.trim()) },
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to delete a folder." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const { revision } = await organisationInput(request)
    if (!organisationUuid.test(id) || !validRevision(revision))
      throw new OrganisationError(400, "Include the folder's saved revision.")
    return Response.json(await deleteFolder(user.id, id, revision), {
      headers: organisationHeaders,
    })
  } catch (error) {
    return organisationFailure(error)
  }
}
