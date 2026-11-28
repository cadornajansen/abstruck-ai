import { signInWithGoogle, signUp } from "@/app/auth/actions"
import { AccountEntry } from "@/components/auth/account-entry"
import { safeNextPath } from "@/lib/auth/redirect"

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>
}) {
  const params = await searchParams
  return (
    <AccountEntry
      mode="sign-up"
      action={signUp}
      googleAction={signInWithGoogle}
      error={params.error}
      message={params.message}
      next={safeNextPath(params.next)}
    />
  )
}
