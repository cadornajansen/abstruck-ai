import type { Metadata } from "next"
import { resendVerificationEmail } from "@/app/auth/actions"
import { AuthScreen } from "@/components/auth/auth-screen"
import { safeNextPath } from "@/lib/auth/redirect"

export const metadata: Metadata = {
  title: "Verify your email · Abstruck",
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  return (
    <AuthScreen
      mode="verify-email"
      action={resendVerificationEmail}
      next={safeNextPath(params.next)}
    />
  )
}
