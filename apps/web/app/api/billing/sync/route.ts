import { refreshPolarBilling } from "@/lib/polar-billing"
import { billingPost } from "@/lib/polar-http"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<Response> {
  return billingPost(request, async (user) => {
    await refreshPolarBilling(user.id)
    return { synced: true }
  })
}
