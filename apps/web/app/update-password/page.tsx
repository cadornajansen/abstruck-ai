import { updatePassword } from "@/app/auth/actions"
import { AuthScreen } from "@/components/auth/auth-screen"
import { requireUser } from "@/lib/auth/session"

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  await requireUser("/update-password")
  const params = await searchParams
  return (
    <AuthScreen
      mode="update-password"
      action={updatePassword}
      error={params.error}
      message={params.message}
    />
  )
}
