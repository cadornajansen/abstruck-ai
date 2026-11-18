import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const resourceId = (value: unknown, prefix: string): value is string =>
  typeof value === "string" &&
  new RegExp(`^${prefix}_[A-Za-z0-9]{3,100}$`).test(value)

export class PaymongoError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502
  ) {
    super(code)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PaymongoError("provider_contract_unverified", 422)
  return value as Record<string, unknown>
}

function assert(
  condition: unknown,
  code: string,
  status = 422
): asserts condition {
  if (!condition) throw new PaymongoError(code, status)
}

export function testPaymentKey(): string {
  const key = process.env.PAYMONGO_SECRET_KEY
  assert(
    typeof key === "string" && /^sk_test_[A-Za-z0-9]{12,}$/.test(key),
    "test_payments_unavailable",
    503
  )
  return key
}

export function testWebhookSecret(): string {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET
  assert(
    typeof secret === "string" && /^whsk_[A-Za-z0-9]{12,}$/.test(secret),
    "test_webhook_unavailable",
    503
  )
  return secret
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null
): Promise<Buffer> {
  assert(body, "request_body_missing", 400)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const deadline = Date.now() + 10000
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new PaymongoError("request_timeout", 408)),
            Math.max(1, deadline - Date.now())
          )
        }),
      ]).finally(() => clearTimeout(timer))
      if (part.done) break
      size += part.value.byteLength
      assert(size <= 131072, "request_body_too_large", 413)
      chunks.push(part.value)
    }
    return Buffer.concat(chunks)
  } finally {
    await reader.cancel().catch(() => {})
  }
}

export function verifyTestWebhook(
  raw: Buffer,
  signature: string | null,
  nowSeconds = Math.floor(Date.now() / 1000)
): string {
  const secret = testWebhookSecret()
  assert(signature && signature.length <= 256, "signature_invalid", 401)
  const fields: Record<string, string> = {}
  for (const part of signature.split(",")) {
    const match = /^(t|te|li)=([^,]*)$/.exec(part.trim())
    assert(match && !Object.hasOwn(fields, match[1]!), "signature_invalid", 401)
    fields[match[1]!] = match[2]!
  }
  assert(
    Object.keys(fields).length === 3 &&
      /^\d{10}$/.test(fields.t ?? "") &&
      /^[a-f0-9]{64}$/i.test(fields.te ?? "") &&
      fields.li === "",
    "test_signature_required",
    401
  )
  const timestamp = Number(fields.t)
  assert(
    timestamp >= nowSeconds - 300 && timestamp <= nowSeconds + 30,
    "signature_expired",
    401
  )
  const expected = createHmac("sha256", secret)
    .update(`${fields.t}.`)
    .update(raw)
    .digest()
  assert(
    timingSafeEqual(expected, Buffer.from(fields.te!, "hex")),
    "signature_invalid",
    401
  )
  return createHash("sha256").update(raw).digest("hex")
}

interface PaymentRefund {
  id: string
  amount: number
  status: "pending" | "succeeded" | "failed"
}

export interface VerifiedBillingEvent {
  eventId: string
  type: string
  livemode: false
  paymentId: string | null
  checkoutId?: string
  referenceNumber?: string
  paymentIntentId?: string
  amount?: number
  currency?: string
  paymentMethod?: string
  refunds: PaymentRefund[]
}

function refundResource(value: unknown, paymentId: string): PaymentRefund {
  const refund = record(value)
  const attributes = record(refund.attributes)
  assert(
    refund.type === "refund" &&
      resourceId(refund.id, "ref") &&
      attributes.payment_id === paymentId &&
      attributes.livemode !== true &&
      (attributes.currency === undefined || attributes.currency === "PHP"),
    "refund_unverified"
  )
  assert(
    typeof attributes.amount === "number" &&
      Number.isSafeInteger(attributes.amount) &&
      attributes.amount > 0 &&
      attributes.amount <= 19900 &&
      ["pending", "succeeded", "failed"].includes(String(attributes.status)),
    "refund_unverified"
  )
  return {
    id: refund.id as string,
    amount: attributes.amount,
    status: attributes.status as PaymentRefund["status"],
  }
}

function paymentResource(value: unknown): {
  id: string
  attributes: Record<string, unknown>
} {
  const payment = record(value)
  const attributes = record(payment.attributes)
  assert(
    payment.type === "payment" &&
      resourceId(payment.id, "pay") &&
      attributes.livemode !== true &&
      attributes.amount === 19900 &&
      attributes.currency === "PHP",
    "payment_unverified"
  )
  return { id: payment.id, attributes }
}

function checkoutPayments(value: unknown) {
  assert(
    Array.isArray(value) && value.length <= 30,
    "checkout_payment_unverified"
  )
  const payments = value.map(paymentResource)
  assert(
    new Set(payments.map((payment) => payment.id)).size === payments.length &&
      payments.every((payment) =>
        ["paid", "failed", "pending", "processing"].includes(
          String(payment.attributes.status)
        )
      ) &&
      payments.filter((payment) => payment.attributes.status === "paid")
        .length <= 1,
    "checkout_payment_unverified"
  )
  return payments
}

export function parseBillingEvent(raw: Buffer): VerifiedBillingEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.toString("utf8"))
  } catch {
    throw new PaymongoError("invalid_json", 400)
  }
  const event = record(record(parsed).data)
  const attributes = record(event.attributes)
  assert(
    event.type === "event" &&
      resourceId(event.id, "evt") &&
      attributes.livemode === false,
    "test_event_required"
  )
  const type = String(attributes.type)
  const result: VerifiedBillingEvent = {
    eventId: event.id,
    type,
    livemode: false,
    paymentId: null,
    refunds: [],
  }
  if (type === "checkout_session.payment.paid") {
    const session = record(attributes.data)
    const details = record(session.attributes)
    assert(
      session.type === "checkout_session" &&
        resourceId(session.id, "cs") &&
        details.livemode !== true &&
        typeof details.reference_number === "string" &&
        details.reference_number.length <= 100 &&
        Array.isArray(details.payments),
      "checkout_payment_unverified"
    )
    const payments = checkoutPayments(details.payments)
    const payment = payments.find((item) => item.attributes.status === "paid")
    assert(
      payment &&
        payments.every(
          (item) =>
            item.id === payment.id || item.attributes.status === "failed"
        ),
      "checkout_payment_unverified"
    )
    const intent = record(details.payment_intent)
    const intentDetails = record(intent.attributes)
    assert(
      payment.attributes.status === "paid" &&
        record(payment.attributes.source).type === "qrph" &&
        intent.type === "payment_intent" &&
        resourceId(intent.id, "pi") &&
        intentDetails.status === "succeeded" &&
        intentDetails.amount === 19900 &&
        intentDetails.currency === "PHP" &&
        intentDetails.livemode !== true &&
        payment.attributes.payment_intent_id === intent.id,
      "payment_intent_unverified"
    )
    const refunds = payment.attributes.refunds ?? []
    assert(Array.isArray(refunds) && refunds.length <= 40, "refund_unverified")
    return {
      ...result,
      checkoutId: session.id,
      referenceNumber: details.reference_number,
      paymentId: payment.id,
      paymentIntentId: intent.id,
      amount: 19900,
      currency: "PHP",
      paymentMethod: "qrph",
      refunds: refunds.map((refund) => refundResource(refund, payment.id)),
    }
  }
  if (type === "payment.refunded") {
    const payment = paymentResource(attributes.data)
    const refunds = payment.attributes.refunds
    assert(
      Array.isArray(refunds) && refunds.length >= 1 && refunds.length <= 40,
      "refund_unverified"
    )
    return {
      ...result,
      paymentId: payment.id,
      refunds: refunds.map((refund) => refundResource(refund, payment.id)),
    }
  }
  if (type === "payment.refund.updated") {
    const refund = record(attributes.data)
    const details = record(refund.attributes)
    assert(resourceId(details.payment_id, "pay"), "refund_unverified")
    return {
      ...result,
      paymentId: details.payment_id,
      refunds: [refundResource(refund, details.payment_id)],
    }
  }
  throw new PaymongoError("event_type_unsupported", 422)
}

function checkoutUrl(value: unknown): string {
  assert(typeof value === "string", "checkout_url_unverified")
  const url = new URL(value)
  assert(
    url.protocol === "https:" &&
      url.hostname === "checkout.paymongo.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname !== "/",
    "checkout_url_unverified"
  )
  return url.href
}

async function paymongoRequest(
  path: string,
  init?: RequestInit,
  base:
    | "https://api.paymongo.com"
    | "https://orders-api.paymongo.com" = "https://api.paymongo.com"
): Promise<Record<string, unknown>> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${testPaymentKey()}:`).toString("base64")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new PaymongoError(
      init?.method === "POST" &&
        path === "/v2/checkout_sessions" &&
        [400, 401, 403, 422].includes(response.status)
        ? "checkout_creation_rejected"
        : path.endsWith("/expire") && response.status === 400
          ? "checkout_expiry_refused"
          : response.status === 404
            ? "checkout_resource_not_found"
            : "checkout_provider_unavailable",
      502
    )
  }
  const raw = await readBoundedBody(response.body)
  try {
    return record(JSON.parse(raw.toString("utf8")))
  } catch {
    throw new PaymongoError("checkout_response_unreadable", 502)
  }
}

export async function createTestCheckout(order: {
  id: string
  checkout_request: unknown
}): Promise<string> {
  testPaymentKey()
  testWebhookSecret()
  assert(
    order.checkout_request && typeof order.checkout_request === "object",
    "checkout_request_missing",
    409
  )
  const response = await paymongoRequest("/v2/checkout_sessions", {
    method: "POST",
    headers: { "Idempotency-Key": order.id },
    body: JSON.stringify(order.checkout_request),
  })
  const session = record(response.data)
  assert(
    session.type === "checkout_session" && resourceId(session.id, "cs"),
    "checkout_response_unverified"
  )
  return session.id
}

export interface TestCheckoutState {
  session: Record<string, unknown>
  status: "active" | "expired"
  url: string
  paidEvent: VerifiedBillingEvent | null
}

export async function readTestCheckout(order: {
  checkout_id: string | null
  reference_number: string
}): Promise<TestCheckoutState> {
  assert(resourceId(order.checkout_id, "cs"), "checkout_id_missing", 409)
  const readback = record(
    (await paymongoRequest(`/v1/checkout_sessions/${order.checkout_id}`)).data
  )
  const details = record(readback.attributes)
  const items = details.line_items
  assert(
    readback.id === order.checkout_id &&
      readback.type === "checkout_session" &&
      details.livemode === false &&
      details.reference_number === order.reference_number &&
      Array.isArray(items) &&
      items.length === 1 &&
      record(items[0]).amount === 19900 &&
      record(items[0]).currency === "PHP" &&
      record(items[0]).quantity === 1 &&
      Array.isArray(details.payment_method_types) &&
      details.payment_method_types.length === 1 &&
      details.payment_method_types[0] === "qrph" &&
      ["active", "expired"].includes(String(details.status)),
    "checkout_response_unverified"
  )
  const payments = checkoutPayments(details.payments)
  const paid = payments.find((payment) => payment.attributes.status === "paid")
  let paidEvent: VerifiedBillingEvent | null = null
  if (paid) {
    const payment = record(
      (await paymongoRequest(`/v1/payments/${paid.id}`)).data
    )
    const attrs = record(payment.attributes)
    assert(
      payment.id === paid.id && resourceId(attrs.payment_intent_id, "pi"),
      "payment_unverified"
    )
    let intentResponse: Record<string, unknown>
    try {
      intentResponse = await paymongoRequest(
        `/v1/payment_intents/${attrs.payment_intent_id}`,
        undefined,
        "https://orders-api.paymongo.com"
      )
    } catch (error) {
      if (
        !(error instanceof PaymongoError) ||
        error.code !== "checkout_resource_not_found"
      )
        throw error
      // Existing organizations can still serve their intents only on the public API host.
      intentResponse = await paymongoRequest(
        `/v1/payment_intents/${attrs.payment_intent_id}`
      )
    }
    const intent = record(intentResponse.data)
    details.payments = (details.payments as Record<string, unknown>[]).map(
      (item) => (item.id === paid.id ? payment : item)
    )
    details.payment_intent = intent
    // The same canonical provider state reuses the existing exactly-once grant transaction.
    paidEvent = parseBillingEvent(
      Buffer.from(
        JSON.stringify({
          data: {
            id: `evt_read${createHash("sha256").update(JSON.stringify(readback)).digest("hex").slice(0, 40)}`,
            type: "event",
            attributes: {
              type: "checkout_session.payment.paid",
              livemode: false,
              data: readback,
            },
          },
        })
      )
    )
  } else if (details.status === "expired") {
    assert(
      payments.every((payment) => payment.attributes.status === "failed"),
      "checkout_expiry_unverified"
    )
  }
  return {
    session: readback,
    status: details.status as TestCheckoutState["status"],
    url: checkoutUrl(details.checkout_url),
    paidEvent,
  }
}

export async function expireTestCheckout(id: string): Promise<void> {
  assert(resourceId(id, "cs"), "checkout_id_missing", 409)
  await paymongoRequest(`/v1/checkout_sessions/${id}/expire`, {
    method: "POST",
  })
}
