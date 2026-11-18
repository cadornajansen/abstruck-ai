import { getCurrentUser } from "@/lib/auth/session"
import { moveMaterial, OrganisationError } from "@/lib/organisation"
import {
  organisationFailure,
  organisationHeaders,
  organisationInput,
  organisationUuid,
  validRevision,
} from "@/lib/organisation-api"

export const runtime = "nodejs"
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to move a material." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const body = await organisationInput(request)
    const { spaceId, revision } = body
    const folderId = body.folderId ?? null
    if (
      !organisationUuid.test(id) ||
      !validRevision(revision) ||
      (spaceId !== null &&
        (typeof spaceId !== "string" || !organisationUuid.test(spaceId))) ||
      (folderId !== null &&
        (typeof folderId !== "string" || !organisationUuid.test(folderId))) ||
      (folderId !== null && spaceId === null)
    )
      throw new OrganisationError(
        400,
        "Choose a space and its folder, or My Library without a folder."
      )
    return Response.json(
      await moveMaterial(user.id, id, { spaceId, folderId, revision }),
      { headers: organisationHeaders }
    )
  } catch (error) {
    return organisationFailure(error)
  }
}
