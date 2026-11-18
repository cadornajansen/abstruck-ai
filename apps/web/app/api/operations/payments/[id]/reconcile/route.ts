import {
  OperationsError,
  operationsFailure,
  operationsHeaders,
  operationsUuid,
  readOperationsInput,
  reconcileOperationsPayment,
  requireFounder,
} from "@/lib/operations"
import { checkoutReferenceSchema } from "@/lib/operations-types"
export const runtime = "nodejs"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    await requireFounder()
    const { id } = await params,
      { requestId, checkoutId } = await readOperationsInput(request)
    if (
      !operationsUuid.test(id) ||
      typeof requestId !== "string" ||
      !operationsUuid.test(requestId)
    )
      throw new OperationsError(400, "Use valid order and request references.")
    const reference = checkoutReferenceSchema.optional().safeParse(checkoutId)
    if (!reference.success)
      throw new OperationsError(400, "Use a valid PayMongo checkout reference.")
    return Response.json(
      await reconcileOperationsPayment(id, requestId, reference.data),
      {
        headers: operationsHeaders,
      }
    )
  } catch (error) {
    return operationsFailure(error)
  }
}
