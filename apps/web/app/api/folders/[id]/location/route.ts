import { getCurrentUser } from "@/lib/auth/session"
import { moveFolder, OrganisationError } from "@/lib/organisation"
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
      { error: "Sign in to move a folder." },
      { status: 401 }
    )
  const { id } = await params
  try {
    const { spaceId, revision } = await organisationInput(request)
    if (
      !organisationUuid.test(id) ||
      typeof spaceId !== "string" ||
      !organisationUuid.test(spaceId) ||
      !validRevision(revision)
    )
      throw new OrganisationError(
        400,
        "Choose a destination space and include the saved folder revision."
      )
    return Response.json(await moveFolder(user.id, id, revision, spaceId), {
      headers: organisationHeaders,
    })
  } catch (error) {
    return organisationFailure(error)
  }
}
