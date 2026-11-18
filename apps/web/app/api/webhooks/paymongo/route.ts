import { billingFailure } from "@/lib/billing"
import {
  parseBillingEvent,
  PaymongoError,
  readBoundedBody,
  verifyTestWebhook,
} from "@/lib/paymongo"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"

export const runtime = "nodejs"
const headers = { "Cache-Control": "no-store" }

export async function POST(request: Request): Promise<Response> {
  try {
    if (
      !request.headers.get("content-type")?.startsWith("application/json") ||
      request.headers.has("content-encoding")
    )
      throw new PaymongoError("callback_content_type_invalid", 415)
    const declared = request.headers.get("content-length")
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 131072))
      throw new PaymongoError("request_body_too_large", 413)
    const raw = await readBoundedBody(request.body)
    const hash = verifyTestWebhook(
      raw,
      request.headers.get("paymongo-signature")
    )
    const event = parseBillingEvent(raw)
    const { data, error } = await createAdminClient().rpc(
      "process_billing_event",
      { p_event: event as unknown as Json, p_body_sha256: hash }
    )
    if (error || !data) throw new Error("callback_persistence_unavailable")
    if (typeof data === "object" && !Array.isArray(data) && "error" in data)
      throw new PaymongoError("event_conflict", 409)
    return Response.json(data, { headers })
  } catch (error) {
    return billingFailure(error)
  }
}
