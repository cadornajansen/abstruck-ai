import { redirect } from "next/navigation"
import { billingPaths, getBillingView } from "@/lib/pricing"

export default async function BillingRoute({
  searchParams,
}: {
  searchParams: Promise<{
    checkout?: string | string[]
    upgrade?: string | string[]
  }>
}) {
  const view = getBillingView({ ...(await searchParams), settings: "billing" })
  redirect(billingPaths[view ?? "settings"])
}
