"use client"

import Image from "next/image"
import { ArrowUpRight, Check } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { proFeatures } from "@/lib/pricing"
import { BillingCheckout } from "./billing-checkout"
import type { BillingUsageState } from "./billing-usage"

export function UpgradeDialog({
  billing,
  label = "Upgrade",
  initiallyOpen = false,
  onDismiss,
}: {
  billing: BillingUsageState
  label?: string
  initiallyOpen?: boolean
  onDismiss?: () => void
}) {
  const { usage, error, refresh } = billing
  const subscribed = usage?.plan === "paid" || !!usage?.subscription

  return (
    <Dialog
      defaultOpen={initiallyOpen}
      onOpenChange={(open) => {
        if (!open) onDismiss?.()
      }}
    >
      <DialogTrigger
        render={
          <Button className="h-9 gap-1.5 rounded-full bg-neutral-950 px-4 text-white shadow-sm hover:bg-neutral-800" />
        }
      >
        {label}
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100%-2rem))] gap-0 overflow-y-auto rounded-[1.75rem] bg-white p-6 text-neutral-950 shadow-2xl ring-0 sm:max-w-[26rem] sm:p-8">
        <DialogHeader className="gap-2">
          <Image
            src="/abstruck-logo.svg"
            alt=""
            width={36}
            height={36}
            unoptimized
            className="mb-3 size-9"
          />
          <DialogTitle className="text-[2rem] leading-none font-semibold tracking-tight">
            Abstruck Pro
          </DialogTitle>
          <DialogDescription className="text-neutral-600">
            Your monthly study allowances
          </DialogDescription>
        </DialogHeader>
        <ul className="my-6 grid gap-2.5 text-sm leading-snug">
          {proFeatures.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5">
              <Check
                aria-hidden="true"
                className="size-4 shrink-0 text-emerald-700"
              />
              {feature}
            </li>
          ))}
        </ul>
        {error ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm">
            <p>{error}</p>
            <Button variant="outline" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : !usage ? (
          <p role="status" className="py-3 text-sm text-muted-foreground">
            Loading your plan…
          </p>
        ) : subscribed ? (
          <div className="grid gap-2">
            <p className="text-sm">You already have a Pro subscription.</p>
            {usage.hasBillingAccount && (
              <BillingCheckout
                action="portal"
                disabled={!usage.checkoutAvailable}
              />
            )}
          </div>
        ) : (
          <>
            <BillingCheckout
              action="checkout"
              defaultCurrency={usage.defaultCurrency}
              disabled={!usage.checkoutAvailable}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {usage.checkoutAvailable
                ? "Renews monthly. Cancel in Settings."
                : "Checkout is temporarily unavailable."}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
