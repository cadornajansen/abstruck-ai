"use client"

import { useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { monthlyPrices, type BillingCurrency } from "@/lib/pricing"
import { billingRequest } from "./billing-request"

type BillingCheckoutProps = { disabled?: boolean } & (
  | { action: "checkout"; defaultCurrency: BillingCurrency }
  | { action: "portal"; defaultCurrency?: never }
)

export function BillingCheckout({
  action,
  defaultCurrency,
  disabled = false,
}: BillingCheckoutProps) {
  const [currency, setCurrency] = useState<BillingCurrency>(
    defaultCurrency ?? "usd"
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const submitting = useRef(false)
  const checkout = action === "checkout"

  async function openPolar(): Promise<void> {
    if (disabled || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError("")
    try {
      const { url } = await billingRequest<{ url: string }>(
        `/api/billing/${action}`,
        {
          method: "POST",
          body: JSON.stringify(checkout ? { currency } : {}),
        }
      )
      window.location.assign(url)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Billing could not be opened. Please try again."
      )
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <div
      className={
        checkout ? "grid w-full gap-3" : "grid justify-items-start gap-2"
      }
    >
      {checkout && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5">
          <div>
            <p className="font-medium">Monthly plan</p>
            <label className="mt-1 flex items-center text-xs text-muted-foreground">
              <span className="sr-only">Billing currency</span>
              <select
                value={currency}
                disabled={disabled || busy}
                onChange={(event) =>
                  setCurrency(event.target.value === "php" ? "php" : "usd")
                }
                className="cursor-pointer rounded-sm bg-transparent pr-1 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <option value="php">PHP</option>
                <option value="usd">USD</option>
              </select>
            </label>
          </div>
          <p
            aria-live="polite"
            className="flex items-baseline gap-1 whitespace-nowrap"
          >
            <span className="text-3xl font-semibold tracking-tight">
              {monthlyPrices[currency].pro}
            </span>
            <span className="text-xs text-muted-foreground">/ month</span>
          </p>
        </div>
      )}
      <Button
        onClick={openPolar}
        disabled={disabled || busy}
        aria-busy={busy}
        className={
          checkout
            ? "h-11 w-full rounded-full bg-neutral-950 text-white shadow-sm hover:bg-neutral-800"
            : "h-9 rounded-full px-4"
        }
      >
        {busy && <Spinner />}
        {busy
          ? "Opening Polar…"
          : checkout
            ? "Continue to checkout"
            : "Manage billing"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
