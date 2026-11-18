"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import type { BillingOrder } from "@/lib/billing-types"
import { billingRequest } from "./billing-usage"

interface CheckoutIntent {
  requestId: string
  orderId: string | null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const terminal = new Set<BillingOrder["state"]>([
  "paid",
  "refunded",
  "partially_refunded",
  "failed",
  "expired",
])

export function BillingCheckout({
  ownerId,
  orders,
  disabled,
  paid,
  onCreated,
}: {
  ownerId: string
  orders: BillingOrder[]
  disabled: boolean
  paid: boolean
  onCreated: (order: BillingOrder) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const pendingRef = useRef(false)
  const intentRef = useRef<CheckoutIntent | null>(null)
  const openOrder = orders.find((order) =>
    ["creating", "pending", "review"].includes(order.state)
  )

  async function recover(action: "check" | "expire"): Promise<void> {
    if (!openOrder || pendingRef.current || disabled) return
    pendingRef.current = true
    setPending(true)
    setError("")
    setNotice("")
    try {
      const result = await billingRequest<{ order: BillingOrder }>(
        `/api/billing/orders/${openOrder.id}/recover`,
        {
          method: "POST",
          body: JSON.stringify({ action }),
        }
      )
      if (terminal.has(result.order.state)) {
        intentRef.current = null
        try {
          sessionStorage.removeItem(`abstruck-checkout:v1:${ownerId}`)
        } catch {
          /* Server order identity remains authoritative. */
        }
      }
      setNotice(
        result.order.state === "expired"
          ? "The unpaid checkout is closed. You can start a new checkout."
          : result.order.state === "pending"
            ? "This checkout is still active. Continue it to generate a fresh QR if the old code expired."
            : result.order.state === "paid"
              ? "Payment confirmed. Do not pay again for this order."
              : "Your saved checkout status is updated."
      )
      onCreated(result.order)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The checkout could not be confirmed. Keep this order and check again."
      )
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  async function create(): Promise<void> {
    if (pendingRef.current || disabled) return
    pendingRef.current = true
    setPending(true)
    setError("")
    const key = `abstruck-checkout:v1:${ownerId}`
    try {
      let intent = intentRef.current
      if (!intent) {
        try {
          const stored = JSON.parse(
            sessionStorage.getItem(key) ?? "null"
          ) as CheckoutIntent | null
          if (
            stored &&
            typeof stored.requestId === "string" &&
            uuid.test(stored.requestId) &&
            (stored.orderId === null ||
              (typeof stored.orderId === "string" && uuid.test(stored.orderId)))
          )
            intent = stored
        } catch {
          /* A new request is allowed only after the current payment history was loaded. */
        }
      }
      const previous = orders.find((order) => order.id === intent?.orderId)
      if (previous && terminal.has(previous.state)) intent = null
      intent ??= { requestId: crypto.randomUUID(), orderId: null }
      intentRef.current = intent
      // Keep the same request across a lost response or page reload.
      sessionStorage.setItem(key, JSON.stringify(intent))
      const result = await billingRequest<{ order: BillingOrder }>(
        "/api/billing/orders",
        {
          method: "POST",
          body: JSON.stringify({ requestId: intent.requestId }),
        }
      )
      intentRef.current = { ...intent, orderId: result.order.id }
      sessionStorage.setItem(key, JSON.stringify(intentRef.current))
      onCreated(result.order)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout could not be started. Retry in this tab to use the same request."
      )
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {openOrder ? (
        <div className="flex flex-col gap-2">
          <Button
            render={<Link href={`/billing?order=${openOrder.id}`} />}
            nativeButton={false}
            variant="secondary"
            className="h-11 w-full rounded-xl"
          >
            Check existing checkout
          </Button>
          <Button
            variant="secondary"
            disabled={disabled || pending}
            onClick={() => void recover("check")}
          >
            {pending && <Spinner data-icon="inline-start" />}
            {pending ? "Checking checkout…" : "Check with PayMongo"}
          </Button>
          {openOrder.checkoutUrl && (
            <Button
              variant="secondary"
              disabled={disabled || pending}
              onClick={() => void recover("expire")}
            >
              Close unpaid checkout
            </Button>
          )}
          <p className="text-xs leading-5 text-primary-foreground/70">
            An expired QR can be replaced on the same checkout page. Close it
            here only if you want a different checkout.
          </p>
        </div>
      ) : (
        <Button
          disabled={disabled || pending}
          onClick={() => void create()}
          variant="secondary"
          className="h-11 w-full rounded-xl"
        >
          {pending && <Spinner data-icon="inline-start" />}
          {pending
            ? "Preparing test checkout…"
            : paid
              ? "Extend by 30 days — test checkout"
              : "Upgrade — test checkout"}
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error} Your order reference is kept. Check its status before paying
            again.
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="text-xs leading-5">
          {notice}
        </p>
      )}
    </div>
  )
}
