import { getCurrentUser } from "@/lib/auth/session"
import {
  billingFailure,
  billingHeaders,
  billingIdPattern,
  getBillingOrder,
} from "@/lib/billing"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers: billingHeaders }
    )
  const { id } = await params
  if (!billingIdPattern.test(id))
    return Response.json(
      { error: "Payment not found." },
      { status: 404, headers: billingHeaders }
    )
  try {
    const order = await getBillingOrder(user.id, id)
    return order
      ? Response.json({ order }, { headers: billingHeaders })
      : Response.json(
          { error: "Payment not found." },
          { status: 404, headers: billingHeaders }
        )
  } catch (error) {
    return billingFailure(error)
  }
}
