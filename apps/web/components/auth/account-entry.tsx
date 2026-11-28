import "server-only"

import type { ComponentProps } from "react"
import { redirect } from "next/navigation"
import { buttonVariants } from "@workspace/ui/components/button"
import { Brand } from "@/components/workspace/brand"
import { getCurrentUser } from "@/lib/auth/session"
import { APP_ORIGIN } from "@/lib/release"
import { AuthScreen } from "./auth-screen"

export async function AccountEntry(props: ComponentProps<typeof AuthScreen>) {
  const port = Number(process.env.LOCAL_BILLING_TEST_LOGIN_PORT)
  const backend = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.POLAR_ENVIRONMENT !== "sandbox" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !backend ||
    !URL.canParse(backend) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(backend).hostname)
  ) {
    if (props.mode === "sign-in" && (await getCurrentUser())) {
      redirect(props.next ?? "/")
    }
    return <AuthScreen {...props} />
  }

  const testLogin = new URL("/sign-in", `http://localhost:${port}`)
  testLogin.searchParams.set("next", props.next ?? "/")

  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-6 py-12 sm:pt-36">
      <div className="flex w-full max-w-96 flex-col items-center text-center">
        <Brand />
        <h1 className="mt-9 text-2xl font-medium tracking-tight">
          Billing sandbox
        </h1>
        <p className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">
          Use the test account to try Pro checkout with sandbox payments.
        </p>
        <a
          href={testLogin.href}
          className={buttonVariants({ className: "h-12 w-full rounded-2xl" })}
        >
          Continue with test account
        </a>
        <a
          href={`${APP_ORIGIN}/sign-in`}
          className="mt-4 rounded-sm text-sm underline underline-offset-4"
        >
          Use Google on live Abstruck
        </a>
      </div>
    </main>
  )
}
