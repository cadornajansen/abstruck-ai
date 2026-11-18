import { redirect } from "next/navigation"

import { signIn, signInWithGoogle } from "@/app/auth/actions"
import { AuthScreen } from "@/components/auth/auth-screen"
import { safeNextPath } from "@/lib/auth/redirect"
import { getCurrentUser } from "@/lib/auth/session"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  if (await getCurrentUser()) redirect(next)
  return (
    <AuthScreen
      mode="sign-in"
      action={signIn}
      googleAction={signInWithGoogle}
      error={params.error}
      message={params.message}
      next={next}
    />
  )
}
