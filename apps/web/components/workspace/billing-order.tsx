"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Clock, WarningTriangle } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { BillingOrder } from "@/lib/billing-types"
import { billingAmount, billingDate, billingRequest } from "./billing-usage"

const orderCopy: Record<
  BillingOrder["state"],
  { label: string; title: string; detail: string }
> = {
  creating: {
    label: "Preparing",
    title: "Preparing your test checkout",
    detail:
      "Your order is saved. Check its status to continue; avoid starting another checkout.",
  },
  pending: {
    label: "Pending",
    title: "Waiting for payment confirmation",
    detail:
      "If you have already paid, do not pay again. You can keep studying and return to check this order.",
  },
  paid: {
    label: "Paid",
    title: "Test payment confirmed",
    detail:
      "This payment is confirmed. Your current paid period and any prepaid dates are shown below.",
  },
  refunded: {
    label: "Refunded",
    title: "This test payment was refunded",
    detail:
      "Your current access is shown below. Your saved study content remains available.",
  },
  partially_refunded: {
    label: "Partially refunded",
    title: "This test payment was partially refunded",
    detail: "Your current plan and paid periods are shown below.",
  },
  failed: {
    label: "Failed",
    title: "This checkout could not be completed",
    detail:
      "Check your payment history before starting another checkout. If you were charged, keep this order reference for help.",
  },
  expired: {
    label: "Expired",
    title: "This checkout has expired",
    detail:
      "If you already paid, keep this reference and check its status before paying again.",
  },
  review: {
    label: "Needs checking",
    title: "Payment confirmation needs checking",
    detail:
      "Do not pay again for this order. Keep the reference below and check its status later.",
  },
}

export function billingOrderLabel(state: BillingOrder["state"]): string {
  return orderCopy[state]?.label ?? "Status unavailable"
}

export function BillingOrderStatus({
  orderId,
  onLoaded,
}: {
  orderId: string
  onLoaded: (order: BillingOrder) => void
}) {
  const [order, setOrder] = useState<BillingOrder | null>(null)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setOrder(null)
    setError("")
    async function load() {
      try {
        const result = await billingRequest<{ order: BillingOrder }>(
          `/api/billing/orders/${orderId}`,
          { signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setOrder(result.order)
        setError("")
        onLoaded(result.order)
        if (["creating", "pending", "review"].includes(result.order.state))
          timer = setTimeout(load, 5000)
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your payment status could not be loaded."
          )
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [onLoaded, orderId, revision])
  if (!order && !error)
    return (
      <div role="status" aria-label="Checking payment status">
        <Skeleton className="h-32 w-full rounded-[16px]" />
      </div>
    )
  const copy = order ? orderCopy[order.state] : null
  const Icon =
    order?.state === "paid"
      ? CheckCircle
      : order && ["failed", "expired", "review"].includes(order.state)
        ? WarningTriangle
        : Clock
  return (
    <Alert role="status" className="rounded-[16px] p-5">
      <Icon aria-hidden="true" />
      <AlertTitle>{copy?.title ?? "Payment status is unavailable"}</AlertTitle>
      <AlertDescription className="mt-2 flex flex-col items-start gap-3 leading-6">
        {copy && <p>{copy.detail}</p>}
        {order && (
          <p className="text-xs">
            {billingAmount(order.amount)} · {billingDate(order.createdAt)} ·
            Order {order.id}
          </p>
        )}
        {error && (
          <p className="text-destructive">
            {error}
            {order ? " Showing the last loaded status." : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            Check status
          </Button>
          {!error &&
            order?.state === "pending" &&
            order.checkoutUrl?.startsWith("https://") && (
              <Button
                size="sm"
                render={<a href={order.checkoutUrl} />}
                nativeButton={false}
              >
                Continue test checkout
              </Button>
            )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
