"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { NavArrowLeft } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { BillingOrder } from "@/lib/billing-types"
import { BillingCheckout } from "./billing-checkout"
import { BillingOrderStatus, billingOrderLabel } from "./billing-order"
import {
  BillingUsagePanel,
  billingAmount,
  billingDate,
  billingRequest,
  useBillingUsage,
} from "./billing-usage"
import { useRouter } from "next/navigation"

export function BillingPage({
  ownerId,
  orderId,
  sandboxCheckout,
}: {
  ownerId: string
  orderId: string | null
  sandboxCheckout: boolean
}) {
  const router = useRouter()
  const account = useBillingUsage()
  const [orders, setOrders] = useState<BillingOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState("")
  const [revision, setRevision] = useState(0)
  const seenStatus = useRef<Record<string, BillingOrder["state"]>>({})
  const usage = account.usage

  useEffect(() => {
    if (!sandboxCheckout) return
    const controller = new AbortController()
    setOrdersLoading(true)
    billingRequest<{ orders: BillingOrder[] }>("/api/billing/orders", {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setOrders(result.orders)
          setOrdersError("")
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setOrdersError(
            cause instanceof Error
              ? cause.message
              : "Your payment history could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setOrdersLoading(false)
      })
    return () => controller.abort()
  }, [revision, sandboxCheckout])

  const orderLoaded = useCallback(
    (order: BillingOrder) => {
      setOrders((current) =>
        [order, ...current.filter((item) => item.id !== order.id)].sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
        )
      )
      if (
        ["paid", "refunded", "partially_refunded"].includes(order.state) &&
        seenStatus.current[order.id] !== order.state
      )
        account.refresh()
      seenStatus.current[order.id] = order.state
    },
    [account.refresh]
  )

  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <NavArrowLeft data-icon="inline-start" />
          Back to workspace
        </Button>
        {sandboxCheckout && <Badge variant="outline">Sandbox billing</Badge>}
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-10 sm:px-8">
        <div className="text-center">
          <h1 className="text-3xl leading-10 font-medium tracking-tight">
            Your study plan
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {sandboxCheckout
              ? "Free or ₱199 for 30 days. Pay with QR Ph when you choose to renew."
              : "Abstruck is free during the beta. Your study allowances are shown below."}
          </p>
        </div>
        {sandboxCheckout && (
          <Alert className="rounded-[16px]">
            <AlertTitle>Test checkout only</AlertTitle>
            <AlertDescription>
              Payments on this local workspace use the sandbox. No live charge
              is represented. A return from checkout does not confirm payment;
              the saved order status does.
            </AlertDescription>
          </Alert>
        )}
        {sandboxCheckout && orderId && (
          <BillingOrderStatus orderId={orderId} onLoaded={orderLoaded} />
        )}
        {account.error && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-col items-start gap-3">
              {account.error}
              {usage && <span>Showing the last loaded plan and usage.</span>}
              <Button variant="outline" size="sm" onClick={account.refresh}>
                Retry usage
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {usage && (
          <section className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <h2 className="text-lg font-medium">
                {usage.plan === "paid" ? "Paid Plan" : "Free Plan"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {usage.activeUntil
                  ? `Current paid access ends ${billingDate(usage.activeUntil)}.`
                  : "Your Free study allowance is active."}
              </p>
              {usage.nextPaidStartsAt && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Next prepaid period starts{" "}
                  {billingDate(usage.nextPaidStartsAt)}.
                </p>
              )}
              {usage.paidThrough && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {usage.plan === "paid" || usage.nextPaidStartsAt
                    ? "Paid through"
                    : "Previous paid period ended"}{" "}
                  {billingDate(usage.paidThrough)}.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={account.loading}
              onClick={account.refresh}
            >
              {account.loading ? "Refreshing…" : "Refresh usage"}
            </Button>
          </section>
        )}
        {account.loading && !usage && (
          <div role="status" aria-label="Loading current plan">
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        <div
          className={
            sandboxCheckout
              ? "mx-auto grid w-full max-w-[672px] gap-8 sm:grid-cols-2"
              : "w-full max-w-sm"
          }
        >
          <Card className="rounded-[28px] py-6 [--card-spacing:--spacing(6)]">
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>
                A starting place for your study routine.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <p>
                <span className="text-4xl font-medium">₱0</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  per 30-day allowance period
                </span>
              </p>
              <ul className="flex flex-col gap-3 text-sm">
                <li>Notes and saved study content</li>
                <li>Included study tools with a smaller allowance</li>
                <li>Keep reviewing your saved work</li>
              </ul>
            </CardContent>
            <CardFooter className="mt-auto bg-transparent">
              <p className="text-sm text-muted-foreground">
                {usage
                  ? usage.plan === "free"
                    ? "Current plan"
                    : "Available when paid access ends"
                  : "Plan status is shown when loaded"}
              </p>
            </CardFooter>
          </Card>
          {sandboxCheckout && (
            <Card className="rounded-[28px] bg-primary py-6 text-primary-foreground [--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle>Paid Plan</CardTitle>
                <CardDescription className="text-primary-foreground/70">
                  More room for everyday study.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <p>
                  <span className="text-4xl font-medium">₱199</span>
                  <span className="ml-2 text-sm text-primary-foreground/70">
                    per 30 days
                  </span>
                </p>
                <ul className="flex flex-col gap-3 text-sm">
                  <li>Every included study tool</li>
                  <li>Higher study allowances</li>
                  <li>One-time QR Ph payment</li>
                  <li>Manual renewal · no automatic debit</li>
                </ul>
              </CardContent>
              <CardFooter className="mt-auto border-primary-foreground/15 bg-transparent">
                <BillingCheckout
                  ownerId={ownerId}
                  orders={orders}
                  disabled={
                    ordersLoading ||
                    !!ordersError ||
                    account.loading ||
                    !!account.error ||
                    !usage
                  }
                  paid={usage?.plan === "paid"}
                  onCreated={(order) => {
                    orderLoaded(order)
                    router.push(`/billing?order=${order.id}`)
                  }}
                />
              </CardFooter>
            </Card>
          )}
        </div>
        {sandboxCheckout && (
          <p className="text-center text-xs leading-6 text-muted-foreground">
            Early renewal starts after your current paid period. It does not
            reset the current allowance early.
          </p>
        )}
        {usage && <BillingUsagePanel usage={usage} />}
        {sandboxCheckout && usage && usage.grants.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-medium">Paid periods</h2>
            <ul className="divide-y rounded-[16px] border px-4">
              {usage.grants.map((grant) => (
                <li
                  key={grant.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
                >
                  <div>
                    <p>
                      {billingDate(grant.startsAt)}–{billingDate(grant.endsAt)}
                    </p>
                    <Link
                      href={`/billing?order=${grant.orderId}`}
                      className="mt-1 inline-block text-xs text-muted-foreground underline underline-offset-4"
                    >
                      View payment
                    </Link>
                  </div>
                  <Badge variant="outline">
                    {grant.state === "revoked"
                      ? "Revoked"
                      : grant.id === usage.period.grantId
                        ? "Current"
                        : usage.nextPaidStartsAt &&
                            Date.parse(grant.startsAt) >=
                              Date.parse(usage.nextPaidStartsAt)
                          ? "Prepaid"
                          : "Past"}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
        {sandboxCheckout && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-medium">Payment history</h2>
              <Button
                variant="outline"
                size="sm"
                disabled={ordersLoading}
                onClick={() => setRevision((value) => value + 1)}
              >
                Refresh payments
              </Button>
            </div>
            {ordersError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {ordersError} Creating another checkout is unavailable until
                  your history can be checked.
                </AlertDescription>
              </Alert>
            )}
            {ordersLoading && !orders.length ? (
              <Skeleton className="h-20 w-full" />
            ) : orders.length ? (
              <ul className="divide-y rounded-[16px] border px-4">
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/billing?order=${order.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
                    >
                      <div>
                        <p>
                          {billingAmount(order.amount)} ·{" "}
                          {billingDate(order.createdAt)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Order {order.id.slice(0, 8)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {billingOrderLabel(order.state)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              !ordersError && (
                <p className="text-sm text-muted-foreground">
                  No payments yet.
                </p>
              )
            )}
          </section>
        )}
      </main>
    </div>
  )
}
