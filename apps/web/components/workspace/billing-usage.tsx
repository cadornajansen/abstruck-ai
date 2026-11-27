"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Progress } from "@workspace/ui/components/progress"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import type { AccountUsage, BillingUsage } from "@/lib/billing-types"

import { billingRequest } from "./billing-request"
import { BillingCheckout } from "./billing-checkout"

export function billingDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function subscriptionSummary(usage: AccountUsage): string {
  const subscription = usage.subscription
  if (subscription?.status === "past_due")
    return "Your renewal payment needs attention. Update your payment method in Polar."
  if (subscription?.status === "paused")
    return "Your subscription is paused. View its status in Polar."
  if (usage.plan === "paid" && subscription?.currentPeriodEnd) {
    const date = billingDate(subscription.currentPeriodEnd)
    return subscription.cancelAtPeriodEnd
      ? `Your Pro access ends ${date}.`
      : `Your next renewal is ${date}.`
  }
  return usage.plan === "paid"
    ? "Your Pro study allowances are active."
    : "Your Free study allowances are active."
}

function storageSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${Number((bytes / 1024 ** 3).toFixed(1))} GiB`
  if (bytes >= 1024 ** 2) return `${Number((bytes / 1024 ** 2).toFixed(1))} MiB`
  if (bytes >= 1024) return `${Number((bytes / 1024).toFixed(1))} KiB`
  return `${bytes} B`
}

const metrics: {
  key: keyof BillingUsage
  label: string
  format: (value: number) => string
}[] = [
  { key: "storageBytes", label: "Stored files", format: storageSize },
  {
    key: "documentPages",
    label: "Imported document pages",
    format: (value) => `${value.toLocaleString()} pages`,
  },
  {
    key: "transcriptionSeconds",
    label: "Audio & video",
    format: (value) => `${Number((value / 60).toFixed(1))} minutes`,
  },
  {
    key: "ocrPages",
    label: "Scanned pages",
    format: (value) => `${value.toLocaleString()} pages`,
  },
  {
    key: "chatMessages",
    label: "Study chat",
    format: (value) => `${value.toLocaleString()} messages`,
  },
  {
    key: "studySets",
    label: "Generated study sets",
    format: (value) => `${value.toLocaleString()} sets`,
  },
]

export function useBillingUsage(enabled = true) {
  const [usage, setUsage] = useState<AccountUsage | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setLoading(true)
    billingRequest<AccountUsage>("/api/billing/usage", {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        if (
          !["free", "paid"].includes(result.plan) ||
          !result.used ||
          !result.limits
        )
          throw new Error("Your plan could not be loaded. Please try again.")
        setUsage(result)
        setError("")
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your usage could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [enabled, revision])
  return { usage, loading, error, refresh }
}

export function BillingUsagePanel({
  usage,
  compact = false,
}: {
  usage: AccountUsage
  compact?: boolean
}) {
  const overStorage = usage.used.storageBytes > usage.limits.storageBytes
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn("font-medium", compact ? "text-sm" : "text-xl")}>
          Your allowance
        </h2>
        <span className="text-xs text-muted-foreground">
          {billingDate(usage.period.startsAt)}–
          {billingDate(usage.period.endsAt)}
        </span>
      </div>
      {overStorage && (
        <Alert variant="destructive">
          <AlertTitle>
            {usage.plan === "free"
              ? "Over the Free storage limit"
              : "Storage limit reached"}
          </AlertTitle>
          <AlertDescription>
            New uploads are paused. Your saved materials and study content
            remain available.
          </AlertDescription>
        </Alert>
      )}
      <dl className={cn("grid gap-x-10 gap-y-6", !compact && "sm:grid-cols-2")}>
        {metrics.map(({ key, label, format }) => {
          const used = usage.used[key]
          const limit = usage.limits[key]
          return (
            <div key={key} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt>{label}</dt>
                <dd className="text-right text-muted-foreground">
                  {format(used)} / {format(limit)}
                </dd>
              </div>
              <Progress
                value={
                  limit > 0
                    ? Math.min(100, (used / limit) * 100)
                    : used > 0
                      ? 100
                      : 0
                }
                aria-label={`${label} usage`}
                className={cn(
                  "h-1.5",
                  used >= limit &&
                    limit > 0 &&
                    "[&_[data-slot=progress-indicator]]:bg-destructive"
                )}
              />
              {!compact && (
                <p className="text-xs text-muted-foreground">
                  {format(usage.remaining[key])} remaining
                </p>
              )}
            </div>
          )
        })}
      </dl>
      <p className="text-xs leading-5 text-muted-foreground">
        Storage counts your retained files. Scanned pages also count as document
        pages.{" "}
        {usage.limits.concurrentJobs === 1
          ? "One item can process at a time."
          : `Up to ${usage.limits.concurrentJobs} items can process at once.`}
      </p>
    </section>
  )
}

export function BillingSettingsPanel({
  preview = false,
}: {
  preview?: boolean
}) {
  const { usage, loading, error, refresh } = useBillingUsage(!preview)
  if (preview)
    return (
      <p className="text-sm text-muted-foreground">
        Plan and usage details are available in your signed-in workspace.
      </p>
    )
  if (loading && !usage)
    return (
      <div
        role="status"
        aria-label="Loading plan"
        className="flex flex-col gap-5"
      >
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    )
  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col items-start gap-2">
            {error}
            {usage && <span>Showing the last loaded usage.</span>}
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {usage && (
        <>
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-sm font-medium">
                {usage.plan === "paid" ? "Abstruck Pro" : "Free plan"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {subscriptionSummary(usage)}
              </p>
            </div>
            {usage.hasBillingAccount ? (
              <BillingCheckout
                action="portal"
                disabled={!usage.checkoutAvailable || !!error}
              />
            ) : (
              <Button
                render={<Link href="/billing" />}
                nativeButton={false}
                variant="outline"
                className="rounded-xl"
              >
                View plans
              </Button>
            )}
          </div>
          <BillingUsagePanel usage={usage} compact />
        </>
      )}
    </div>
  )
}

export function BillingPlanBadge({
  enabled,
  className,
}: {
  enabled: boolean
  className?: string
}) {
  const { usage, error } = useBillingUsage(enabled)
  return (
    <Badge variant="outline" className={className}>
      {!enabled
        ? "Free Plan"
        : error
          ? "Plan unavailable"
          : usage
            ? usage.plan === "paid"
              ? "Pro"
              : "Free Plan"
            : "Loading plan…"}
    </Badge>
  )
}
