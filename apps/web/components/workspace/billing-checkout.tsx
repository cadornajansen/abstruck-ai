"use client"

import { useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { billingRequest } from "./billing-request"

export function BillingCheckout({
  action,
  disabled = false,
}: {
  action: "checkout" | "portal"
  disabled?: boolean
}) {
  const [currency, setCurrency] = useState<"usd" | "php">("usd")
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
    <div className="flex flex-col items-start gap-3">
      {checkout && (
        <label className="flex items-center gap-2 text-sm">
          Billing currency
          <select
            value={currency}
            disabled={disabled || busy}
            onChange={(event) =>
              setCurrency(event.target.value === "php" ? "php" : "usd")
            }
            className="rounded-lg border bg-background px-2 py-1.5 text-foreground"
          >
            <option value="usd">USD · $6.99/month</option>
            <option value="php">PHP · ₱199/month</option>
          </select>
        </label>
      )}
      <Button
        onClick={openPolar}
        disabled={disabled || busy}
        className="rounded-xl"
      >
        {busy && <Spinner />}
        {busy
          ? "Opening Polar…"
          : checkout
            ? "Upgrade to Pro"
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
