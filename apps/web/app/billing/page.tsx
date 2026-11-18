import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth/session"
import { BillingPage } from "@/components/workspace/billing-page"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function BillingRoute({
  searchParams,
}: {
  searchParams: Promise<{
    order?: string | string[]
    return?: string | string[]
  }>
}) {
  const query = await searchParams
  const orderId = typeof query.order === "string" ? query.order : null
  if (orderId && !uuid.test(orderId)) notFound()
  const user = await requireUser(
    `/billing${orderId ? `?order=${orderId}` : ""}`
  )
  return <BillingPage ownerId={user.id} orderId={orderId} />
}
