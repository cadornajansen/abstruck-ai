import {
  getSharedOutput,
  shareBearer,
  shareFailure,
  sharingHeaders,
} from "@/lib/sharing"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(await getSharedOutput(shareBearer(request)), {
      headers: sharingHeaders,
    })
  } catch (error) {
    return shareFailure(error, true)
  }
}
