import { signIn, signInWithGoogle } from "@/app/auth/actions"
import { AccountEntry } from "@/components/auth/account-entry"
import { safeNextPath } from "@/lib/auth/redirect"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  return (
    <AccountEntry
      mode="sign-in"
      action={signIn}
      googleAction={signInWithGoogle}
      error={params.error}
      message={params.message}
      next={next}
    />
  )
}
