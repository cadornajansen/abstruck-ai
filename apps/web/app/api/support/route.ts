import { getSupport, submitSupport, supportInput } from "@/lib/support"
import {
  operationsFailure,
  operationsHeaders,
  readOperationsInput,
} from "@/lib/operations"
export const runtime = "nodejs"
export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(
      await getSupport(
        new URL(request.url).searchParams.get("requestId") ?? undefined
      ),
      { headers: operationsHeaders }
    )
  } catch (error) {
    return operationsFailure(error)
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    return Response.json(
      await submitSupport(
        supportInput(await readOperationsInput(request, 28000))
      ),
      { status: 202, headers: operationsHeaders }
    )
  } catch (error) {
    return operationsFailure(error)
  }
}
