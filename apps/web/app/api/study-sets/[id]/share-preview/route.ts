import { getCurrentUser } from "@/lib/auth/session"
import {
  getSharePreview,
  ShareError,
  shareFailure,
  sharingHeaders,
  sharingIdPattern,
} from "@/lib/sharing"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to share your work." },
      { status: 401, headers: sharingHeaders }
    )
  try {
    const { id } = await params
    const query = new URL(request.url).searchParams
    const versionId = query.get("versionId") || undefined
    const originals = query.get("includeOriginals") ?? "false"
    if (
      !sharingIdPattern.test(id) ||
      (versionId && !sharingIdPattern.test(versionId)) ||
      !["true", "false"].includes(originals)
    )
      throw new ShareError("invalid_request", 400)
    const preview = await getSharePreview(
      user.id,
      id,
      originals === "true",
      versionId
    )
    return Response.json({ preview }, { headers: sharingHeaders })
  } catch (error) {
    return shareFailure(error)
  }
}
