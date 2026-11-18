import { getCurrentUser } from "@/lib/auth/session"
import {
  createOutputShare,
  listOutputShares,
  ShareError,
  shareFailure,
  sharingHeaders,
  sharingIdPattern,
  sharingObject,
} from "@/lib/sharing"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view your links." },
      { status: 401, headers: sharingHeaders }
    )
  try {
    const studySetId =
      new URL(request.url).searchParams.get("studySetId") || undefined
    if (studySetId && !sharingIdPattern.test(studySetId))
      throw new ShareError("invalid_request", 400)
    return Response.json(
      { shares: await listOutputShares(user.id, studySetId) },
      { headers: sharingHeaders }
    )
  } catch (error) {
    return shareFailure(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to share your work." },
      { status: 401, headers: sharingHeaders }
    )
  try {
    const body: unknown = await request.json().catch(() => null)
    if (
      !sharingObject(body) ||
      typeof body.studySetId !== "string" ||
      !sharingIdPattern.test(body.studySetId) ||
      typeof body.requestId !== "string" ||
      !sharingIdPattern.test(body.requestId) ||
      typeof body.revision !== "number" ||
      !Number.isInteger(body.revision) ||
      body.revision < 0 ||
      body.revision > 2147483646 ||
      (body.versionId != null &&
        (typeof body.versionId !== "string" ||
          !sharingIdPattern.test(body.versionId))) ||
      (body.includeOriginals !== undefined &&
        typeof body.includeOriginals !== "boolean")
    )
      throw new ShareError("invalid_request", 400)
    let expiresAt: string | undefined
    if (body.expiresAt != null) {
      if (
        typeof body.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(body.expiresAt)) ||
        Date.parse(body.expiresAt) <= Date.now()
      )
        throw new ShareError("invalid_expiry", 400)
      expiresAt = new Date(body.expiresAt).toISOString()
    }
    const result = await createOutputShare(user.id, {
      studySetId: body.studySetId,
      requestId: body.requestId,
      revision: body.revision,
      includeOriginals: body.includeOriginals === true,
      ...(typeof body.versionId === "string"
        ? { versionId: body.versionId }
        : {}),
      ...(expiresAt ? { expiresAt } : {}),
    })
    return Response.json(result, { status: 201, headers: sharingHeaders })
  } catch (error) {
    return shareFailure(error)
  }
}
