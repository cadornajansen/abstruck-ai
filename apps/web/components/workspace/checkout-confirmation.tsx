"use client"

import { useEffect, useState } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { billingRequest } from "./billing-request"
import type { BillingUsageState } from "./billing-usage"

export function CheckoutConfirmation({
  billing,
}: {
  billing: BillingUsageState
}) {
  const { usage, refresh } = billing
  const confirmed = usage?.plan === "paid" && !!usage.subscription
  const available = usage?.checkoutAvailable
  const [attempt, setAttempt] = useState(0)
  const [delayed, setDelayed] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (confirmed || !available) return
    const controller = new AbortController()
    let interval: ReturnType<typeof setInterval>
    async function check() {
      try {
        await billingRequest("/api/billing/sync", {
          method: "POST",
          signal: controller.signal,
        })
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Subscription status is temporarily unavailable."
          )
      }
      if (controller.signal.aborted) return
      refresh()
      let checks = 0
      interval = setInterval(() => {
        refresh()
        if (++checks >= 8) {
          clearInterval(interval)
          setDelayed(true)
        }
      }, 3000)
    }
    void check()
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [confirmed, available, attempt, refresh])

  return (
    <Alert aria-live="polite">
      <AlertTitle>
        {confirmed
          ? "Your Pro plan is active"
          : "Confirming your subscription…"}
      </AlertTitle>
      <AlertDescription className="grid justify-items-start gap-2">
        {confirmed
          ? "Your Pro allowances are ready to use."
          : error ||
            (available === false
              ? "Billing is temporarily unavailable. Check back here for your plan status."
              : "You can keep studying while Polar confirms your subscription.")}
        {!confirmed && (delayed || error) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError("")
              setDelayed(false)
              setAttempt((n) => n + 1)
            }}
          >
            Check again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
