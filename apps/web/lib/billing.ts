import "server-only"

import type {
  AccountUsage,
  BillingContext,
  BillingUsage,
} from "@/lib/billing-types"
import { isPolarBillingConfigured } from "@/lib/polar-config"
import { createAdminClient } from "@/lib/supabase/admin"

export const billingHeaders = { "Cache-Control": "private, no-store" }

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function getBillingContext(
  ownerId: string
): Promise<BillingContext> {
  const { data, error } = await createAdminClient().rpc(
    "billing_account_context",
    { p_owner_id: ownerId }
  )
  if (
    error ||
    !object(data) ||
    data.ownerId !== ownerId ||
    !object(data.limits)
  )
    throw new Error("billing_context_unavailable")
  return data as unknown as BillingContext
}

export async function getAccountUsage(ownerId: string): Promise<AccountUsage> {
  const context = await getBillingContext(ownerId)
  const { data, error } = await createAdminClient().rpc(
    "billing_usage_totals",
    {
      p_owner_id: ownerId,
      p_period_id: context.periodId,
    }
  )
  if (error || !object(data)) throw new Error("usage_unavailable")
  const used = data as unknown as BillingUsage
  const remaining = { ...used }
  for (const metric of Object.keys(used) as (keyof BillingUsage)[]) {
    remaining[metric] = Math.max(0, context.limits[metric] - used[metric])
  }
  return {
    plan: context.plan,
    planVersion: context.planVersion,
    period: {
      id: context.periodId,
      startsAt: context.startsAt,
      endsAt: context.endsAt,
      grantId: context.grantId,
    },
    limits: context.limits,
    used,
    remaining,
    checkoutAvailable: isPolarBillingConfigured(),
    hasBillingAccount: context.hasBillingAccount === true,
    subscription: context.subscription ?? null,
  }
}
