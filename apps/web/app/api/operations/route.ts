import {
  getOperationsOverview,
  operationsFailure,
  operationsHeaders,
} from "@/lib/operations"
export const runtime = "nodejs"
export async function GET(): Promise<Response> {
  try {
    return Response.json(
      { overview: await getOperationsOverview() },
      { headers: operationsHeaders }
    )
  } catch (error) {
    return operationsFailure(error)
  }
}
