import { getCurrentUser } from "@/lib/auth/session"
import {
  billingFailure,
  billingHeaders,
  billingIdPattern,
  getBillingOrders,
  startBillingOrder,
} from "@/lib/billing"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view your payments." },
      { status: 401, headers: billingHeaders }
    )
  try {
    return Response.json(
      { orders: await getBillingOrders(user.id) },
      { headers: billingHeaders }
    )
  } catch (error) {
    return billingFailure(error)
  }
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers: billingHeaders }
    )
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    !("requestId" in body) ||
    typeof body.requestId !== "string" ||
    !billingIdPattern.test(body.requestId)
  )
    return Response.json(
      { error: "Include a valid checkout request ID." },
      { status: 400, headers: billingHeaders }
    )
  try {
    return Response.json(
      { order: await startBillingOrder(user.id, body.requestId) },
      { status: 202, headers: billingHeaders }
    )
  } catch (error) {
    return billingFailure(error)
  }
}
