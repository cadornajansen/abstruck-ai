import { getCurrentUser } from "@/lib/auth/session"
import {
  revokeOutputShare,
  ShareError,
  shareFailure,
  sharingHeaders,
  sharingIdPattern,
} from "@/lib/sharing"

export const runtime = "nodejs"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to manage your links." },
      { status: 401, headers: sharingHeaders }
    )
  try {
    const { id } = await params
    if (!sharingIdPattern.test(id)) throw new ShareError("not_found", 404)
    return Response.json(
      { share: await revokeOutputShare(user.id, id) },
      { headers: sharingHeaders }
    )
  } catch (error) {
    return shareFailure(error)
  }
}
