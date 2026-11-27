import { requireUser } from "@/lib/auth/session"
import { BillingPage } from "@/components/workspace/billing-page"

export default async function BillingRoute({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string | string[] }>
}) {
  const returnedFromCheckout = (await searchParams).checkout === "success"
  await requireUser(
    returnedFromCheckout ? "/billing?checkout=success" : "/billing"
  )
  return <BillingPage returnedFromCheckout={returnedFromCheckout} />
}
