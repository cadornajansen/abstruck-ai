import { getCurrentUser } from "@/lib/auth/session"
import { billingHeaders, getAccountUsage } from "@/lib/billing"

export const runtime = "nodejs"

export async function GET(): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view your usage." },
      { status: 401, headers: billingHeaders }
    )
  try {
    return Response.json(await getAccountUsage(user.id), {
      headers: billingHeaders,
    })
  } catch {
    return Response.json(
      { error: "Your billing usage is temporarily unavailable." },
      { status: 503, headers: billingHeaders }
    )
  }
}
