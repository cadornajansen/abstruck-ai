import { webhooks } from "@polar-sh/sdk/2026-10"
import { applyPolarWebhook } from "@/lib/polar-billing"
import { getPolarConfig } from "@/lib/polar-config"
import { billingJson, PolarBillingError, polarFailure } from "@/lib/polar-http"
import { readWebhookBody } from "@/lib/bounded-webhook-body"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  try {
    if (
      !request.headers.get("content-type")?.startsWith("application/json") ||
      request.headers.has("content-encoding")
    ) {
      return billingJson(
        { error: "Expected an uncompressed JSON webhook." },
        415
      )
    }
    const raw = await readWebhookBody(
      request.body,
      (message, status) => new PolarBillingError(status, message)
    )
    const eventId = request.headers.get("webhook-id")
    if (!eventId || eventId.length > 128)
      return billingJson({ error: "Missing delivery ID." }, 400)
    const event = await webhooks.validateEvent(
      raw,
      Object.fromEntries(request.headers),
      getPolarConfig().webhookSecret
    )
    await applyPolarWebhook(event, eventId)
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookVerificationError)
      return billingJson({ error: "Invalid webhook signature." }, 403)
    return polarFailure(error)
  }
}
