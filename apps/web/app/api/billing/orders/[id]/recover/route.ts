import { getCurrentUser } from "@/lib/auth/session"
import {
  billingFailure,
  billingHeaders,
  billingIdPattern,
  recoverBillingOrder,
} from "@/lib/billing"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers: billingHeaders }
    )
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !billingIdPattern.test(id) ||
    !body ||
    typeof body !== "object" ||
    !("action" in body) ||
    typeof body.action !== "string" ||
    !["check", "expire"].includes(body.action)
  )
    return Response.json(
      { error: "Include a valid checkout action." },
      { status: 400, headers: billingHeaders }
    )
  try {
    const order = await recoverBillingOrder(
      user.id,
      id,
      body.action as "check" | "expire"
    )
    return Response.json({ order }, { headers: billingHeaders })
  } catch (error) {
    return billingFailure(error)
  }
}
