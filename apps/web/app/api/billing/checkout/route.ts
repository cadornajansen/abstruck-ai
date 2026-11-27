import { startPolarCheckout } from "@/lib/polar-billing"
import { billingPost, PolarBillingError } from "@/lib/polar-http"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<Response> {
  return billingPost(request, async (user) => {
    const body: unknown = await request.json().catch(() => null)
    if (
      !body ||
      typeof body !== "object" ||
      !("currency" in body) ||
      (body.currency !== "usd" && body.currency !== "php")
    ) {
      throw new PolarBillingError(400, "Select USD or PHP for checkout.")
    }
    return { url: await startPolarCheckout(user.id, user.email, body.currency) }
  })
}
