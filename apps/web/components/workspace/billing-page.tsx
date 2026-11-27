"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { NavArrowLeft } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { BillingCheckout } from "./billing-checkout"
import { billingRequest } from "./billing-request"
import {
  BillingUsagePanel,
  subscriptionSummary,
  useBillingUsage,
} from "./billing-usage"

export function BillingPage({
  returnedFromCheckout,
}: {
  returnedFromCheckout: boolean
}) {
  const { usage, loading, error, refresh } = useBillingUsage()
  const active = usage?.plan === "paid"
  const [delayed, setDelayed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [syncError, setSyncError] = useState("")
  const confirmed = active && !!usage?.subscription
  const pending = returnedFromCheckout && !confirmed

  useEffect(() => {
    if (!pending || !usage?.checkoutAvailable) return
    const abort = new AbortController()
    let interval: ReturnType<typeof setInterval> | undefined
    let checks = 0

    async function sync(): Promise<void> {
      try {
        await billingRequest("/api/billing/sync", {
          method: "POST",
          signal: abort.signal,
        })
      } catch (cause) {
        if (!abort.signal.aborted) {
          setSyncError(
            cause instanceof Error
              ? cause.message
              : "Subscription status is temporarily unavailable."
          )
        }
      }
      if (abort.signal.aborted) return
      refresh()
      interval = setInterval(() => {
        refresh()
        if (++checks >= 8) {
          clearInterval(interval)
          setDelayed(true)
        }
      }, 3000)
    }
    void sync()
    return () => {
      abort.abort()
      clearInterval(interval)
    }
  }, [pending, usage?.checkoutAvailable, attempt, refresh])

  const retry = useCallback(() => {
    setDelayed(false)
    setSyncError("")
    setAttempt((value) => value + 1)
    refresh()
  }, [refresh])

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8 sm:py-12">
      <Button
        variant="ghost"
        size="sm"
        render={<Link href="/" />}
        nativeButton={false}
        className="self-start"
      >
        <NavArrowLeft data-icon="inline-start" /> Back to workspace
      </Button>
      <h1 className="text-3xl font-medium tracking-tight">
        Plan &amp; Billing
      </h1>
      {returnedFromCheckout && (
        <Alert aria-live="polite">
          <AlertTitle>
            {confirmed
              ? "Your Pro plan is active"
              : delayed || syncError
                ? "Confirmation is taking longer"
                : "Confirming your subscription…"}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {confirmed
              ? "Your Pro allowances are ready to use."
              : "You can keep studying while we check your subscription with Polar."}
            {pending && usage && !usage.checkoutAvailable && (
              <span>
                Polar billing is temporarily unavailable. Check back here for
                your plan status.
              </span>
            )}
            {!confirmed && syncError && <span>{syncError}</span>}
            {!confirmed && (delayed || syncError) && (
              <Button size="sm" variant="outline" onClick={retry}>
                Check again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            {error}{" "}
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && !usage && (
        <Skeleton
          role="status"
          aria-label="Loading your plan"
          className="h-32 w-full"
        />
      )}
      {usage && (
        <>
          <section className="flex flex-col items-start gap-3 border-b pb-7">
            <h2 className="text-lg font-medium">
              {active ? "Abstruck Pro" : "Free plan"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {subscriptionSummary(usage)}
            </p>
            {usage.hasBillingAccount && (
              <BillingCheckout
                action="portal"
                disabled={!usage.checkoutAvailable || !!error}
              />
            )}
          </section>
          {!active && !pending && (
            <section className="flex flex-col items-start gap-4 rounded-2xl border p-5 sm:p-6">
              <h2 className="text-xl font-medium">Abstruck Pro</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Each month includes 10 hours of media processing, 500 document
                pages, and 300 study-chat questions. Pro renews monthly until
                you cancel.
              </p>
              <BillingCheckout
                action="checkout"
                disabled={!usage.checkoutAvailable || !!error}
              />
              {!usage.checkoutAvailable && (
                <p className="text-sm text-muted-foreground">
                  Checkout is currently unavailable.
                </p>
              )}
            </section>
          )}
          <BillingUsagePanel usage={usage} />
        </>
      )}
    </main>
  )
}
