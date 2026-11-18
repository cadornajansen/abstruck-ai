import {
  OperationsError,
  operationsFailure,
  operationsHeaders,
  operationsUuid,
  readOperationsInput,
  requireFounder,
  retryOperationsJob,
} from "@/lib/operations"
export const runtime = "nodejs"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireFounder()
    const { id } = await params,
      { requestId } = await readOperationsInput(request)
    if (
      !operationsUuid.test(id) ||
      typeof requestId !== "string" ||
      !operationsUuid.test(requestId)
    )
      throw new OperationsError(400, "Use valid job and request references.")
    return Response.json(await retryOperationsJob(id, requestId), {
      headers: operationsHeaders,
    })
  } catch (error) {
    return operationsFailure(error)
  }
}
