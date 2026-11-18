import "server-only"

import { createHash } from "node:crypto"

import type {
  AccountUsage,
  BillingContext,
  BillingGrant,
  BillingOrder,
  BillingUsage,
} from "@/lib/billing-types"
import {
  createTestCheckout,
  expireTestCheckout,
  readTestCheckout,
  PaymongoError,
  testPaymentKey,
  testWebhookSecret,
} from "@/lib/paymongo"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, Tables } from "@/lib/supabase/database.types"

export const billingHeaders = { "Cache-Control": "private, no-store" }
export const billingIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function billingFailure(error: unknown): Response {
  const code =
    error instanceof PaymongoError ? error.code : "billing_unavailable"
  const status = error instanceof PaymongoError ? error.status : 503
  const recoveryMessages: Record<string, string> = {
    checkout_operation_busy:
      "This checkout is already being checked. Wait a moment, then check again.",
    checkout_recovery_window_closed:
      "This checkout needs support review before another payment. Keep its order reference; do not pay again.",
    checkout_payment_processing:
      "PayMongo has not confirmed that this checkout can close. If a payment is processing, wait and check again; do not pay twice.",
    checkout_check_uncertain:
      "The checkout status could not be confirmed. Your saved order is kept; check again before paying.",
    checkout_creation_rejected:
      "PayMongo did not accept this checkout. Refresh your payments before trying again.",
    checkout_creation_uncertain:
      "Your checkout needs support review. Keep its order reference; do not start another payment.",
    order_not_found: "Payment not found.",
  }
  const message =
    recoveryMessages[code] ??
    (status === 401
      ? "Payment callback could not be verified."
      : status === 503
        ? "Test checkout is not available yet. Your saved work is still available."
        : "This payment request could not be verified. Check its status before trying again.")
  return Response.json(
    { error: message, code },
    { status, headers: billingHeaders }
  )
}

function publicOrder(row: Tables<"payment_orders">): BillingOrder {
  return {
    id: row.id,
    state: row.state as BillingOrder["state"],
    amount: 19900,
    currency: "PHP",
    checkoutUrl: row.checkout_url,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
    errorCode: row.error_code,
  }
}

export async function getBillingContext(
  ownerId: string
): Promise<BillingContext> {
  const { data, error } = await createAdminClient().rpc(
    "billing_account_context",
    { p_owner_id: ownerId }
  )
  if (
    error ||
    !object(data) ||
    data.ownerId !== ownerId ||
    !object(data.limits)
  )
    throw new Error("billing_context_unavailable")
  return data as unknown as BillingContext
}

export async function getAccountUsage(ownerId: string): Promise<AccountUsage> {
  const context = await getBillingContext(ownerId)
  const db = createAdminClient()
  const [totals, grants] = await Promise.all([
    db.rpc("billing_usage_totals", {
      p_owner_id: ownerId,
      p_period_id: context.periodId,
    }),
    db
      .from("access_grants")
      .select("id,order_id,starts_at,ends_at,state")
      .eq("owner_id", ownerId)
      .order("starts_at", { ascending: false })
      .limit(100),
  ])
  if (totals.error || !object(totals.data) || grants.error)
    throw new Error("usage_unavailable")
  const used = totals.data as unknown as BillingUsage
  const remaining = { ...used }
  for (const metric of Object.keys(used) as (keyof BillingUsage)[])
    remaining[metric] = Math.max(0, context.limits[metric] - used[metric])
  const history: BillingGrant[] = (grants.data ?? []).map((grant) => ({
    id: grant.id,
    orderId: grant.order_id,
    startsAt: grant.starts_at,
    endsAt: grant.ends_at,
    state: grant.state as BillingGrant["state"],
  }))
  const now = Date.now()
  const available = history.filter(
    (grant) => grant.state === "active" && Date.parse(grant.endsAt) > now
  )
  const future = available
    .filter((grant) => Date.parse(grant.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  return {
    plan: context.plan,
    planVersion: context.planVersion,
    period: {
      id: context.periodId,
      startsAt: context.startsAt,
      endsAt: context.endsAt,
      grantId: context.grantId,
    },
    activeUntil: context.plan === "paid" ? context.endsAt : null,
    nextPaidStartsAt: future[0]?.startsAt ?? null,
    paidThrough:
      available.sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0]
        ?.endsAt ?? null,
    limits: context.limits,
    used,
    remaining,
    grants: history,
    testMode: true,
    allowancesProvisional: true,
  }
}

export async function getBillingOrders(
  ownerId: string
): Promise<BillingOrder[]> {
  const { data, error } = await createAdminClient()
    .from("payment_orders")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(25)
  if (error) throw new Error("orders_unavailable")
  return data.map(publicOrder)
}

export async function getBillingOrder(
  ownerId: string,
  id: string
): Promise<BillingOrder | null> {
  const { data, error } = await createAdminClient()
    .from("payment_orders")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error("order_unavailable")
  return data ? publicOrder(data) : null
}

export async function startBillingOrder(
  ownerId: string,
  requestId: string
): Promise<BillingOrder> {
  testPaymentKey()
  testWebhookSecret()
  const appUrl = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  )
  if (
    !["http:", "https:"].includes(appUrl.protocol) ||
    appUrl.username ||
    appUrl.password
  )
    throw new Error("invalid_app_url")
  const db = createAdminClient()
  const { data, error } = await db.rpc("create_billing_checkout_order", {
    p_owner_id: ownerId,
    p_request_id: requestId,
    p_app_origin: appUrl.origin,
    p_key_hash: createHash("sha256").update(testPaymentKey()).digest("hex"),
  })
  if (error || !object(data) || !object(data.order))
    throw new Error("order_creation_unavailable")
  const order = data.order as unknown as Tables<"payment_orders">
  if (data.createCheckout !== true) return publicOrder(order)
  try {
    return await recoverBillingOrder(ownerId, order.id, "check")
  } catch {
    // Keep an uncertain creation for reconciliation; the dispatch marker prevents another POST.
    const savedOrder = await getBillingOrder(ownerId, order.id)
    if (!savedOrder) throw new Error("order_unavailable")
    return savedOrder
  }
}

function recoveryError(message: string): PaymongoError {
  const code = [
    "checkout_operation_busy",
    "checkout_recovery_window_closed",
    "checkout_creation_uncertain",
    "order_not_found",
  ].find((value) => message.includes(value))
  return new PaymongoError(
    code ?? "checkout_check_uncertain",
    code === "order_not_found" ? 404 : 409
  )
}

export async function recoverBillingOrder(
  ownerId: string,
  orderId: string,
  action: "check" | "expire"
): Promise<BillingOrder> {
  const db = createAdminClient()
  const claimed = await db.rpc("claim_billing_order_operation", {
    p_owner_id: ownerId,
    p_order_id: orderId,
    p_action: action,
    p_key_hash: createHash("sha256").update(testPaymentKey()).digest("hex"),
  })
  if (claimed.error) throw recoveryError(claimed.error.message)
  if (!object(claimed.data) || !object(claimed.data.order))
    throw recoveryError("")
  const order = claimed.data.order as unknown as Tables<"payment_orders">
  const token = claimed.data.token
  if (typeof token !== "string" || !billingIdPattern.test(token))
    return publicOrder(order)
  let outcome: "expired" | "rejected" | undefined
  try {
    if (!order.checkout_id) {
      if (claimed.data.createCheckout !== true)
        throw new PaymongoError("checkout_creation_uncertain", 409)
      const id = await createTestCheckout(order)
      // Save a known provider ID before any follow-up GET can fail.
      const remembered = await db
        .from("payment_orders")
        .update({ checkout_id: id })
        .eq("id", order.id)
        .eq("owner_id", ownerId)
        .eq("operation_token", token)
        .or(`checkout_id.is.null,checkout_id.eq.${id}`)
        .select("id")
        .maybeSingle()
      if (remembered.error || !remembered.data) throw recoveryError("")
      order.checkout_id = id
    }
    let current = await readTestCheckout(order)
    if (
      action === "expire" &&
      !current.paidEvent &&
      current.status === "active"
    ) {
      try {
        await expireTestCheckout(order.checkout_id)
      } catch (error) {
        if (
          !(error instanceof PaymongoError) ||
          error.code !== "checkout_expiry_refused"
        )
          throw error
      }
      // Paid/processing races and already-expired responses are resolved by a new canonical read.
      current = await readTestCheckout(order)
      if (!current.paidEvent && current.status !== "expired")
        throw new PaymongoError("checkout_payment_processing", 409)
    }
    if (current.paidEvent) {
      const event = current.paidEvent
      const applied = await db.rpc("process_billing_event", {
        p_event: event as unknown as Json,
        p_body_sha256: createHash("sha256")
          .update(JSON.stringify(event))
          .digest("hex"),
      })
      if (
        applied.error ||
        !object(applied.data) ||
        applied.data.error ||
        applied.data.reconciliationRequired
      )
        throw recoveryError("")
    } else if (current.status === "expired") outcome = "expired"
    else {
      const attached = await db.rpc("attach_billing_checkout", {
        p_owner_id: ownerId,
        p_order_id: orderId,
        p_checkout_id: order.checkout_id,
        p_checkout_url: current.url,
      })
      if (attached.error || !attached.data) throw recoveryError("")
    }
    const finished = await db.rpc("finish_billing_order_operation", {
      p_owner_id: ownerId,
      p_order_id: orderId,
      p_token: token,
      ...(outcome ? { p_outcome: outcome } : {}),
    })
    if (finished.error || !finished.data) throw recoveryError("")
    const saved = await getBillingOrder(ownerId, orderId)
    if (!saved) throw recoveryError("order_not_found")
    return saved
  } catch (error) {
    const code =
      error instanceof PaymongoError ? error.code : "checkout_check_uncertain"
    if (code === "checkout_creation_rejected" && !order.checkout_id)
      outcome = "rejected"
    await db.rpc("finish_billing_order_operation", {
      p_owner_id: ownerId,
      p_order_id: orderId,
      p_token: token,
      ...(outcome === "rejected" ? { p_outcome: outcome } : {}),
      p_error: code,
    })
    throw error instanceof PaymongoError ? error : recoveryError("")
  }
}
