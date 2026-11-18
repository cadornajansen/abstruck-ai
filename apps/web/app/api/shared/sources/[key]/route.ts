import { shareBearer, shareFailure, sharingHeaders } from "@/lib/sharing"
import { getSharedSourceLink } from "@/lib/sharing-storage"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
): Promise<Response> {
  try {
    const { key } = await params
    return Response.json(await getSharedSourceLink(shareBearer(request), key), {
      headers: sharingHeaders,
    })
  } catch (error) {
    return shareFailure(error, true)
  }
}
