import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createHmac, randomUUID } from "node:crypto"
import { registerHooks } from "node:module"
import process from "node:process"
import test from "node:test"

// Exercise the actual routes, SDK and PostgREST client. Only the signed-in user
// and network responses are fixtures. An unexpected request fails the test.
const owner = randomUUID()
const organization = randomUUID()
const product = randomUUID()
const customer = randomUUID()
const reservation = randomUUID()
const checkout = randomUUID()
const secret = Buffer.from("local-webhook-test").toString("base64")
const app = "http://localhost:3000"
Object.assign(process.env, {
  POLAR_ENVIRONMENT: "sandbox",
  POLAR_ACCESS_TOKEN: "local-test",
  POLAR_ORGANIZATION_ID: organization,
  POLAR_PRODUCT_ID: product,
  POLAR_WEBHOOK_SECRET: "whsec_" + secret,
  NEXT_PUBLIC_APP_URL: app,
  VERCEL_ENV: "development",
  SUPABASE_URL: "https://billing-test.invalid",
  SUPABASE_SECRET_KEY: "local-test",
})
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export{}", shortCircuit: true }
    if (specifier === "@/lib/auth/session")
      return {
        url:
          "data:text/javascript,export const getCurrentUser = async () => (" +
          JSON.stringify({ id: owner, email: "learner@example.invalid" }) +
          ")",
        shortCircuit: true,
      }
    if (specifier.startsWith("@/"))
      return {
        url: new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href,
        shortCircuit: true,
      }
    return nextResolve(specifier, context)
  },
})

const purchase = await import("../app/api/billing/checkout/route.ts")
const webhook = await import("../app/api/webhooks/polar/route.ts")
const portal = await import("../app/api/billing/portal/route.ts")
const refresh = await import("../app/api/billing/sync/route.ts")
const post = (path, body) =>
  new Request(app + path, {
    method: "POST",
    headers: { origin: app, "content-type": "application/json" },
    body: JSON.stringify(body),
  })

test("a checkout attaches the signed-in owner and uses the catalog's currency and product", async (t) => {
  for (const currency of ["usd", "php"]) {
    const fixture = {
      id: checkout,
      status: "open",
      organization_id: organization,
      external_customer_id: owner,
      metadata: { abstruck_checkout: reservation },
      products: [{ id: product }],
      currency,
      url: "https://sandbox.polar.sh/checkout/test",
      expires_at: "2030-01-01T00:00:00Z",
    }
    let created = 0,
      attached = false
    t.mock.method(globalThis, "fetch", async (url, init) => {
      const { pathname, hostname } = new URL(url)
      const payload = init?.body && JSON.parse(init.body)
      if (hostname === "sandbox-api.polar.sh") {
        if (pathname === "/v1/customers/external/" + owner + "/state")
          return Response.json({ detail: "not found" }, { status: 404 })
        if (pathname === "/v1/checkouts/" + checkout)
          return Response.json(fixture)
        if (pathname === "/v1/checkouts/" && init.method === "POST") {
          created++
          assert.deepEqual(payload.products, [product])
          assert.equal(payload.external_customer_id, owner)
          assert.equal(payload.currency, currency)
          assert.equal(payload.amount, undefined)
          assert.equal(payload.success_url, app + "/billing?checkout=success")
          return Response.json(fixture)
        }
      }
      if (hostname === "billing-test.invalid") {
        if (pathname.endsWith("/polar_customers")) return Response.json([])
        if (pathname.endsWith("/polar_checkouts"))
          return Response.json(
            attached ? [{ id: reservation, checkout_id: checkout }] : []
          )
        if (pathname.endsWith("/rpc/polar_reserve_checkout"))
          return Response.json({
            action: attached ? "reuse" : "create",
            id: reservation,
            currency: currency.toUpperCase(),
            url: fixture.url,
          })
        if (pathname.endsWith("/rpc/polar_finish_checkout")) {
          assert.equal(payload.p_checkout_id, checkout)
          assert.equal(payload.p_owner_id, owner)
          assert.equal(payload.p_state, "open")
          attached = true
          return Response.json(true)
        }
      }
      throw Error("Unexpected request " + pathname)
    })
    for (let click = 0; click < 2; click++) {
      const response = await purchase.POST(
        post("/api/billing/checkout", {
          currency,
          ownerId: "ignored",
          amount: 1,
        })
      )
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { url: fixture.url })
    }
    assert.equal(created, 1)
    t.mock.restoreAll()
  }
})

test("the portal creates a customer session for the authenticated account", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).pathname, "/v1/customer-sessions/")
    assert.equal(JSON.parse(init.body).external_customer_id, owner)
    return Response.json({
      customer: {
        type: "individual",
        external_id: owner,
        organization_id: organization,
      },
      customer_portal_url: "https://sandbox.polar.sh/portal/test",
    })
  })
  const response = await portal.POST(
    post("/api/billing/portal", { customerId: "ignored" })
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    url: "https://sandbox.polar.sh/portal/test",
  })
})

test("an unpaid renewal stays manageable and a revoked subscription clears Pro", async (t) => {
  let recoverable = true
  let snapshot
  const sub = {
    id: randomUUID(),
    customer_id: customer,
    product_id: product,
    status: "past_due",
    current_period_start: "2027-02-01T00:00:00Z",
    current_period_end: "2027-03-01T00:00:00Z",
    cancel_at_period_end: false,
  }
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const { pathname, searchParams } = new URL(url)
    if (pathname === "/v1/customers/external/" + owner + "/state")
      return Response.json({
        type: "individual",
        id: customer,
        organization_id: organization,
        external_id: owner,
        active_subscriptions: [
          { ...sub, product_id: randomUUID(), status: "active" },
        ],
      })
    if (pathname === "/v1/subscriptions/") {
      assert.equal(searchParams.get("customer_id"), customer)
      assert.equal(searchParams.get("product_id"), product)
      return Response.json({ items: recoverable ? [sub] : [] })
    }
    if (pathname.endsWith("/rpc/polar_sync_subscription")) {
      snapshot = JSON.parse(init.body).p_subscription
      return Response.json(true)
    }
    if (pathname.endsWith("/polar_checkouts")) return Response.json([])
    throw Error("Unexpected request " + pathname)
  })
  assert.equal((await refresh.POST(post("/api/billing/sync", {}))).status, 200)
  assert.equal(snapshot.status, "past_due")
  recoverable = false
  assert.equal((await refresh.POST(post("/api/billing/sync", {}))).status, 200)
  assert.deepEqual(snapshot, {})
})

test("signed notifications reconcile current Polar state, including a discounted renewal and cancellation", async (t) => {
  const subscription = {
    id: randomUUID(),
    status: "active",
    product_id: product,
    current_period_start: "2027-02-01T00:00:00Z",
    current_period_end: "2027-03-01T00:00:00Z",
    cancel_at_period_end: true,
  }
  let sync
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const { pathname } = new URL(url)
    if (pathname.endsWith("/profiles")) return Response.json([{ id: owner }])
    if (pathname === "/v1/customers/external/" + owner + "/state")
      return Response.json({
        type: "individual",
        id: customer,
        organization_id: organization,
        external_id: owner,
        active_subscriptions: [subscription],
      })
    if (pathname.endsWith("/rpc/polar_sync_subscription")) {
      sync = JSON.parse(init.body)
      return Response.json(true)
    }
    throw Error("Unexpected request " + pathname)
  })
  const body = JSON.stringify({
    type: "order.paid",
    api_version: "2026-10",
    data: {
      customer_id: customer,
      product_id: product,
      total_amount: 0,
      customer: { external_id: owner, organization_id: organization },
    },
  })
  const eventId = randomUUID()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update([eventId, timestamp, body].join("."))
    .digest("base64")
  const request = (sig) =>
    new Request(app + "/api/webhooks/polar", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "webhook-id": eventId,
        "webhook-timestamp": timestamp,
        "webhook-signature": "v1," + sig,
      },
    })
  assert.equal((await webhook.POST(request("wrong"))).status, 403)
  assert.equal(sync, undefined)
  assert.equal((await webhook.POST(request(signature))).status, 204)
  assert.equal(sync.p_event_id, eventId)
  assert.equal(sync.p_customer_id, customer)
  assert.equal(sync.p_subscription.cancelAtPeriodEnd, true)
  assert.equal(
    sync.p_subscription.currentPeriodEnd,
    subscription.current_period_end
  )
})
