import { resetPassword } from "@/app/auth/actions"
import { AuthScreen } from "@/components/auth/auth-screen"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const params = await searchParams
  return (
    <AuthScreen
      mode="reset-password"
      action={resetPassword}
      error={params.error}
      message={params.message}
    />
  )
}
