import "server-only"

import { isProductionRelease } from "@/lib/release"
import { createHash } from "node:crypto"
import type { User } from "@supabase/supabase-js"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { recoverBillingOrder } from "@/lib/billing"
import { checkoutReferenceSchema } from "@/lib/operations-types"
import { readTestCheckout as readVerifiedTestCheckout } from "@/lib/paymongo"
import type { Json } from "@/lib/supabase/database.types"
import type { OperationsOverview } from "@/lib/operations-types"

export const operationsUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const operationsHeaders = { "Cache-Control": "private, no-store" }
export class OperationsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly auditId?: string
  ) {
    super(message)
  }
}
export function isFounder(user: User): boolean {
  const ids = (process.env.ABSTRUCK_ADMIN_USER_IDS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
  return (
    operationsUuid.test(user.id) &&
    ids.length > 0 &&
    ids.every((id) => operationsUuid.test(id)) &&
    ids.some((id) => id.toLowerCase() === user.id.toLowerCase())
  )
}
export async function requireFounder(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new OperationsError(401, "Sign in to open operations.")
  if (!isFounder(user))
    throw new OperationsError(403, "Founder access is required.")
  return user
}
export async function readOperationsInput(
  request: Request,
  limit = 4096
): Promise<Record<string, unknown>> {
  if (
    !request.body ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new OperationsError(400, "Use a valid request.")
  const chunks: Uint8Array[] = []
  let bytes = 0
  const reader = request.body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) {
        await reader.cancel()
        throw new OperationsError(413, "This request is too large.")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new OperationsError(400, "Use a valid request.")
  return body as Record<string, unknown>
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
export function operationsFailure(error: unknown): Response {
  const status =
    error instanceof OperationsError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 503
  return Response.json(
    {
      error:
        error instanceof OperationsError
          ? error.message
          : status === 400
            ? "Check the request and try again."
            : "This operation could not be completed. Keep the request reference and try again.",
      ...(error instanceof OperationsError && error.auditId
        ? { auditId: error.auditId }
        : {}),
    },
    { status, headers: operationsHeaders }
  )
}

/** Every caller is guarded here as well as at the route boundary. No configuration values leave this module. */
export async function getOperationsOverview(): Promise<OperationsOverview> {
  await requireFounder()
  const { data, error } = await createAdminClient().rpc("operations_snapshot")
  if (error || !object(data)) throw new Error("operations_unavailable")
  const overview = data as unknown as Omit<OperationsOverview, "services">
  const configured = (...names: string[]) =>
    names.every((name) => !!process.env[name])
  const service = (
    name: string,
    present: boolean,
    detail: string
  ): OperationsOverview["services"][number] => ({
    name,
    state: present ? "configured" : "not_configured",
    detail: present ? detail : "Configuration is unavailable.",
  })
  return {
    ...overview,
    services: [
      {
        name: "Database",
        state: "available",
        detail: "Overview query completed.",
      },
      {
        name: "Worker",
        state: "unknown",
        detail: overview.jobs[0]
          ? `Last job checkpoint: ${overview.jobs[0].updatedAt}. Queue state is not a worker heartbeat.`
          : "No job checkpoint is available.",
      },
      service(
        "Private storage",
        configured(
          "R2_ACCOUNT_ID",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_BUCKET"
        ),
        "Configured; no live storage probe was run."
      ),
      service(
        "OpenAI",
        configured("OPENAI_API_KEY"),
        "Configured; provider health was not probed."
      ),
      service(
        "AssemblyAI",
        configured("ASSEMBLYAI_API_KEY"),
        "Configured; provider health was not probed."
      ),
      service(
        "PayMongo test",
        !isProductionRelease() &&
          /^sk_test_/.test(process.env.PAYMONGO_SECRET_KEY ?? ""),
        "Test mode only; no live reconciliation is allowed."
      ),
      service(
        "Support email",
        configured("RESEND_API_KEY", "EMAIL_FROM", "SUPPORT_EMAIL"),
        "Configured; sending is confirmed only by a provider receipt."
      ),
    ],
  }
}

export async function retryOperationsJob(
  id: string,
  requestId: string
): Promise<Json> {
  const actor = await requireFounder()
  const { data, error } = await createAdminClient().rpc(
    "operations_retry_job",
    { p_actor_id: actor.id, p_job_id: id, p_request_id: requestId }
  )
  if (error || !object(data)) throw new Error("retry_unavailable")
  if (data.blocked === true)
    throw new OperationsError(
      409,
      typeof data.error === "string"
        ? data.error
        : "This job cannot be safely retried.",
      requestId
    )
  return data as Json
}

export async function reconcileOperationsPayment(
  id: string,
  requestId: string,
  recoveredCheckoutId?: string
): Promise<Json> {
  const actor = await requireFounder(),
    db = createAdminClient()
  if (
    recoveredCheckoutId !== undefined &&
    !checkoutReferenceSchema.safeParse(recoveredCheckoutId).success
  )
    throw new OperationsError(400, "Use a valid PayMongo checkout reference.")
  const { data: audit, error: auditError } = await db.rpc(
    "operations_begin_action",
    {
      p_actor_id: actor.id,
      p_request_id: requestId,
      p_action: "reconcile_payment",
      p_target_id: id,
    }
  )
  if (auditError || !object(audit)) throw new Error("audit_unavailable")
  if (audit.status !== "started") {
    if (audit.status === "succeeded") return audit.details as Json
    throw new OperationsError(
      409,
      "This attempt was recorded. Refresh and start a new explicit reconciliation.",
      requestId
    )
  }
  try {
    const { data: order, error } = await db
      .from("payment_orders")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error("order_unavailable")
    if (!order) throw new OperationsError(404, "Order not found.", requestId)
    if (order.livemode || order.amount !== 19900 || order.currency !== "PHP")
      throw new OperationsError(
        409,
        "This order is not a supported test checkout.",
        requestId
      )
    if (recoveredCheckoutId && order.checkout_id !== recoveredCheckoutId) {
      if (order.checkout_id)
        throw new OperationsError(
          409,
          "This order already has a different checkout.",
          requestId
        )
      const candidate = { ...order, checkout_id: recoveredCheckoutId }
      let verified: Awaited<ReturnType<typeof readVerifiedTestCheckout>>
      try {
        verified = await readVerifiedTestCheckout(candidate)
      } catch {
        throw new OperationsError(
          409,
          "That checkout could not be verified against this order.",
          requestId
        )
      }
      const attached = await db.rpc("attach_billing_checkout", {
        p_owner_id: order.owner_id,
        p_order_id: order.id,
        p_checkout_id: recoveredCheckoutId,
        p_checkout_url: verified.url,
      })
      if (attached.error || !attached.data)
        throw new OperationsError(
          409,
          "This order changed. Refresh before recovering it.",
          requestId
        )
      await recoverBillingOrder(order.owner_id, order.id, "check")
      order.checkout_id = recoveredCheckoutId
    }
    if (!order.checkout_id)
      throw new OperationsError(
        409,
        "Find this order in PayMongo by its ABSTRUCK-order reference, then enter the original checkout ID.",
        requestId
      )
    const checkout = await readVerifiedTestCheckout(order)
    let outcome = "pending"
    if (checkout.paidEvent) {
      const event = checkout.paidEvent
      const hash = createHash("sha256")
        .update(JSON.stringify(event))
        .digest("hex")
      const applied = await db.rpc("process_billing_event", {
        p_event: event as unknown as Json,
        p_body_sha256: hash,
      })
      if (
        applied.error ||
        !object(applied.data) ||
        applied.data.error ||
        applied.data.reconciliationRequired
      )
        throw new OperationsError(
          409,
          "The verified payment needs review; no new access was assumed.",
          requestId
        )
      outcome = "reconciled"
    }
    const current = await db
      .from("payment_orders")
      .select("state")
      .eq("id", id)
      .single()
    if (current.error) throw new Error("order_unavailable")
    if (
      outcome === "reconciled" &&
      !["paid", "refunded", "partially_refunded"].includes(current.data.state)
    )
      throw new OperationsError(
        409,
        "This verified payment still needs order review. No access grant was assumed.",
        requestId
      )
    const result = {
      orderId: id,
      state: current.data.state,
      outcome,
      auditId: requestId,
      testMode: true,
    }
    const saved = await db.rpc("operations_finish_action", {
      p_request_id: requestId,
      p_status: "succeeded",
      p_details: result,
    })
    if (saved.error || !saved.data)
      throw new Error("audit_checkpoint_unavailable")
    return result
  } catch (error) {
    await db.rpc("operations_finish_action", {
      p_request_id: requestId,
      p_status: "failed",
      p_details: { orderId: id, testMode: true },
      p_error:
        error instanceof OperationsError
          ? `reconciliation_${error.status}`
          : "reconciliation_unavailable",
    })
    if (error instanceof OperationsError) throw error
    throw new OperationsError(
      503,
      "The reconciliation could not be completed. Keep its audit reference.",
      requestId
    )
  }
}
