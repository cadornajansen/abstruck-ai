import { notFound, redirect } from "next/navigation"
import { OperationsScreen } from "@/components/workspace/operations-screen"
import { OperationsError, requireFounder } from "@/lib/operations"

export default async function OperationsPage() {
  try {
    await requireFounder()
  } catch (cause) {
    if (cause instanceof OperationsError) {
      if (cause.status === 401) redirect("/sign-in?next=%2Foperations")
      if (cause.status === 403) notFound()
    }
    throw cause
  }
  return <OperationsScreen />
}
