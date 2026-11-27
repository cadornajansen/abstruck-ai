import "server-only"

import { randomUUID } from "node:crypto"
import {
  createPolar,
  errors,
  type models,
  type webhooks,
} from "@polar-sh/sdk/2026-10"
import { getPolarConfig, polarUuid } from "@/lib/polar-config"
import { PolarBillingError } from "@/lib/polar-http"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"

function connections() {
  const config = getPolarConfig()
  const polar = createPolar({
    accessToken: config.accessToken,
    environment: config.environment,
    organizationId: config.organizationId,
    timeout: 10,
  })
  return { config, polar, db: createAdminClient() }
}
type Connections = ReturnType<typeof connections>
type Currency = "usd" | "php"

function hostedUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("polar_link_invalid")
  return url.href
}

function object(
  value: Json | null
): value is { [key: string]: Json | undefined } {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

async function portal(
  ownerId: string,
  { polar, config }: Connections
): Promise<string> {
  try {
    const session = await polar.customerSessions.create({
      external_customer_id: ownerId,
      return_url: config.appOrigin + "/billing",
    })
    if (
      session.customer.external_id !== ownerId ||
      session.customer.organization_id !== config.organizationId ||
      session.customer.type !== "individual"
    )
      throw new Error("polar_customer_mismatch")
    return hostedUrl(session.customer_portal_url)
  } catch (error) {
    if (error instanceof errors.ResourceNotFound) {
      throw new PolarBillingError(
        404,
        "This account does not have a Polar billing profile yet."
      )
    }
    throw error
  }
}

export async function createPolarPortal(ownerId: string): Promise<string> {
  return portal(ownerId, connections())
}

// Customer state is authoritative for access. A past-due or paused subscription
// can still renew, even when it is absent from the list of active subscriptions.
async function currentSubscription(
  state: models.CustomerState,
  { polar, config }: Connections
) {
  const eligible = state.active_subscriptions.filter(
    (sub) => sub.product_id === config.productId
  )
  if (eligible.length)
    return eligible.sort(
      (a, b) =>
        Date.parse(b.current_period_end) - Date.parse(a.current_period_end)
    )[0]
  const pending = await polar.subscriptions.list({
    organization_id: config.organizationId,
    customer_id: state.id,
    product_id: config.productId,
    status: ["past_due", "paused", "incomplete", "unpaid"],
    sorting: ["-started_at"],
    limit: 1,
  })
  const sub = pending.items[0]
  if (
    sub &&
    (sub.product_id !== config.productId || sub.customer_id !== state.id)
  ) {
    throw new Error("polar_subscription_mismatch")
  }
  return sub?.ended_at ? undefined : sub
}

async function syncCustomer(
  ownerId: string,
  eventId: string,
  services: Connections,
  expectedCustomerId?: string
): Promise<boolean> {
  const { polar, config, db } = services
  const observedAt = new Date().toISOString()
  let state: models.CustomerState | undefined
  try {
    state = await polar.customers.getStateExternal(ownerId)
  } catch (error) {
    if (!(error instanceof errors.ResourceNotFound)) throw error
  }
  if (
    state &&
    (state.external_id !== ownerId ||
      state.type !== "individual" ||
      state.organization_id !== config.organizationId)
  )
    throw new Error("polar_customer_mismatch")
  if (state && expectedCustomerId && state.id !== expectedCustomerId)
    return false

  let customerId = state?.id
  if (!customerId) {
    const known = await db
      .from("polar_customers")
      .select("customer_id")
      .eq("environment", config.environment)
      .eq("owner_id", ownerId)
      .maybeSingle()
    if (known.error) throw new Error("polar_customer_lookup_failed")
    customerId = known.data?.customer_id
    if (
      !customerId ||
      (expectedCustomerId && expectedCustomerId !== customerId)
    )
      return false
  }
  const sub =
    state && !state.deleted_at
      ? await currentSubscription(state, services)
      : undefined
  const saved = await db.rpc("polar_sync_subscription", {
    p_owner_id: ownerId,
    p_environment: config.environment,
    p_customer_id: customerId,
    p_event_id: eventId,
    p_observed_at: observedAt,
    p_subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      : {},
  })
  if (saved.error) throw new Error("polar_sync_failed")
  return !!sub
}

function checkoutOwner(
  checkout: models.Checkout,
  services: Connections,
  ownerId: string,
  reservationId: string
): void {
  if (
    checkout.external_customer_id !== ownerId ||
    checkout.organization_id !== services.config.organizationId ||
    checkout.metadata?.abstruck_checkout !== reservationId ||
    checkout.products.length !== 1 ||
    checkout.products[0]?.id !== services.config.productId
  ) {
    throw new Error("polar_checkout_mismatch")
  }
}

async function saveCheckout(
  checkout: models.Checkout,
  ownerId: string,
  reservationId: string,
  services: Connections,
  hasSubscription = false
): Promise<boolean> {
  checkoutOwner(checkout, services, ownerId, reservationId)
  const state =
    checkout.status === "succeeded"
      ? hasSubscription
        ? "completed"
        : "confirmed"
      : checkout.status
  const result = await services.db.rpc("polar_finish_checkout", {
    p_owner_id: ownerId,
    p_environment: services.config.environment,
    p_id: reservationId,
    p_state: state,
    p_checkout_id: checkout.id,
    p_url: hostedUrl(checkout.url),
    p_expires_at: checkout.expires_at,
  })
  if (result.error) throw new Error("polar_checkout_persistence_failed")
  return result.data === true
}

async function reconcileCheckouts(
  ownerId: string,
  services: Connections,
  hasSubscription: boolean
): Promise<void> {
  const { config, db, polar } = services
  const pending = await db
    .from("polar_checkouts")
    .select("id,checkout_id")
    .eq("environment", config.environment)
    .eq("owner_id", ownerId)
    .in("state", ["creating", "open", "confirmed"])
  if (pending.error) throw new Error("polar_checkout_lookup_failed")
  for (const reservation of pending.data) {
    let checkout: models.Checkout | undefined
    if (reservation.checkout_id) {
      checkout = await polar.checkouts.get(reservation.checkout_id)
    } else {
      // A timed-out create may already have reached Polar. Recover by the
      // reservation embedded in its metadata before considering another charge.
      const sessions = await polar.checkouts.list({
        external_customer_id: ownerId,
        organization_id: config.organizationId,
        product_id: config.productId,
        sorting: ["-created_at"],
        limit: 10,
      })
      checkout = sessions.items.find(
        (item) => item.metadata?.abstruck_checkout === reservation.id
      )
    }
    if (checkout)
      await saveCheckout(
        checkout,
        ownerId,
        reservation.id,
        services,
        hasSubscription
      )
  }
}

export async function refreshPolarBilling(ownerId: string): Promise<void> {
  const services = connections()
  const subscribed = await syncCustomer(
    ownerId,
    "refresh-" + randomUUID(),
    services
  )
  await reconcileCheckouts(ownerId, services, subscribed)
}

export async function startPolarCheckout(
  ownerId: string,
  email: string | undefined,
  currency: Currency
): Promise<string> {
  const services = connections()
  const { config, db, polar } = services
  const subscribed = await syncCustomer(
    ownerId,
    "checkout-" + randomUUID(),
    services
  )
  if (subscribed) return portal(ownerId, services)
  await reconcileCheckouts(ownerId, services, false)
  const reserved = await db.rpc("polar_reserve_checkout", {
    p_owner_id: ownerId,
    p_environment: config.environment,
    p_currency: currency.toUpperCase(),
  })
  const value = reserved.data
  if (reserved.error || !object(value))
    throw new Error("polar_checkout_reservation_failed")
  if (value.action === "portal") return portal(ownerId, services)
  if (value.action === "busy")
    throw new PolarBillingError(
      409,
      "A checkout is being confirmed. Refresh billing in a moment. If it stays pending, contact support."
    )
  if (typeof value.id !== "string" || !polarUuid.test(value.id))
    throw new Error("polar_checkout_invalid")
  if (value.action === "reuse") {
    if (value.currency !== currency.toUpperCase())
      throw new PolarBillingError(
        409,
        "You already have an open checkout in " +
          value.currency +
          ". Select that currency to resume it."
      )
    if (typeof value.url !== "string") throw new Error("polar_checkout_invalid")
    return hostedUrl(value.url)
  }
  if (value.action !== "create") throw new Error("polar_checkout_invalid")
  let checkout: models.Checkout
  try {
    checkout = await polar.checkouts.create({
      products: [config.productId],
      external_customer_id: ownerId,
      customer_email: email,
      currency,
      allow_discount_codes: true,
      allow_trial: false,
      metadata: { abstruck_checkout: value.id },
      success_url: config.appOrigin + "/billing?checkout=success",
      return_url: config.appOrigin + "/billing",
    })
  } catch (error) {
    // Network timeouts and 5xx can follow a successful dispatch. Only a
    // definite rejection releases this reservation for a fresh creation.
    if (
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      [400, 401, 403, 404, 422].includes(error.statusCode)
    ) {
      const failed = await db.rpc("polar_finish_checkout", {
        p_owner_id: ownerId,
        p_environment: config.environment,
        p_id: value.id,
        p_state: "failed",
      })
      if (failed.error)
        throw new Error("polar_checkout_persistence_failed", { cause: error })
    }
    throw error
  }
  const attached = await saveCheckout(checkout, ownerId, value.id, services)
  if (
    !attached ||
    checkout.status !== "open" ||
    checkout.currency.toLowerCase() !== currency
  ) {
    throw new Error("polar_checkout_unavailable")
  }
  return hostedUrl(checkout.url)
}

export async function applyPolarWebhook(
  event: webhooks.WebhookPayload,
  eventId: string
): Promise<void> {
  const services = connections()
  const { config, polar, db } = services
  if (event.api_version !== "2026-10")
    throw new Error("polar_webhook_version_mismatch")
  let ownerId: string | null | undefined
  let customerId: string | undefined
  let reservationId: string | undefined
  let checkoutId: string | undefined
  switch (event.type) {
    case "checkout.created":
    case "checkout.updated":
    case "checkout.expired": {
      const row = event.data
      const reference = row.metadata?.abstruck_checkout
      if (
        row.organization_id !== config.organizationId ||
        typeof reference !== "string" ||
        !polarUuid.test(reference)
      )
        return
      reservationId = reference
      checkoutId = row.id
      ownerId = row.external_customer_id
      break
    }
    case "customer.deleted":
    case "customer.state_changed":
      if (
        event.data.organization_id !== config.organizationId ||
        event.data.type !== "individual"
      )
        return
      ownerId = event.data.external_id
      customerId = event.data.id
      break
    case "subscription.updated":
    case "order.paid":
    case "order.refunded":
      if (
        event.data.product_id !== config.productId ||
        event.data.customer.organization_id !== config.organizationId
      )
        return
      ownerId = event.data.customer.external_id
      customerId = event.data.customer_id
      break
    default:
      return
  }
  if (!ownerId || !polarUuid.test(ownerId)) return
  // Ignore late deliveries for an account whose deletion has already finished.
  const profile = await db
    .from("profiles")
    .select("id")
    .eq("id", ownerId)
    .maybeSingle()
  if (profile.error) throw new Error("polar_owner_lookup_failed")
  if (!profile.data) return
  const subscribed = await syncCustomer(ownerId, eventId, services, customerId)
  if (checkoutId && reservationId) {
    const current = await polar.checkouts.get(checkoutId)
    await saveCheckout(current, ownerId, reservationId, services, subscribed)
  }
}
