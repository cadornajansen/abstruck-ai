import { shareBearer, shareFailure, sharingHeaders } from "@/lib/sharing"
import { getSharedArtifactLink } from "@/lib/sharing-storage"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(await getSharedArtifactLink(shareBearer(request)), {
      headers: sharingHeaders,
    })
  } catch (error) {
    return shareFailure(error, true)
  }
}
