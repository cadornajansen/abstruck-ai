import { getCurrentUser } from "@/lib/auth/session"
import { billingHeaders, getAccountUsage } from "@/lib/billing"
import { getPricingCurrency } from "@/lib/pricing"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view your usage." },
      { status: 401, headers: billingHeaders }
    )
  try {
    const usage = await getAccountUsage(user.id)
    return Response.json(
      { ...usage, defaultCurrency: getPricingCurrency(request.headers) },
      {
        headers: billingHeaders,
      }
    )
  } catch {
    return Response.json(
      { error: "Your billing usage is temporarily unavailable." },
      { status: 503, headers: billingHeaders }
    )
  }
}
