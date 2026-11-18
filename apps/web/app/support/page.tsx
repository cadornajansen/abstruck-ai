import { notFound } from "next/navigation"
import { SupportScreen } from "@/components/workspace/support-screen"
import { requireUser } from "@/lib/auth/session"
import { isFounder, operationsUuid } from "@/lib/operations"

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string | string[] }>
}) {
  const query = await searchParams
  if (
    query.requestId !== undefined &&
    (typeof query.requestId !== "string" ||
      !operationsUuid.test(query.requestId))
  )
    notFound()
  const requestId = typeof query.requestId === "string" ? query.requestId : null
  const user = await requireUser(
    `/support${requestId ? `?requestId=${requestId}` : ""}`
  )
  return (
    <SupportScreen initialRequestId={requestId} founder={isFounder(user)} />
  )
}
