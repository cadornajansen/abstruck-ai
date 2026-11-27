import "server-only"

import type { User } from "@supabase/supabase-js"
import { getCurrentUser } from "@/lib/auth/session"

export class PolarBillingError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function billingJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  })
}

export function polarFailure(error: unknown): Response {
  if (error instanceof PolarBillingError) {
    return billingJson({ error: error.message }, error.status)
  }
  // Provider errors can contain payer details, request bodies and session URLs.
  console.error(
    "Polar billing request failed",
    error instanceof Error ? error.name : "unknown"
  )
  return billingJson(
    { error: "Billing is temporarily unavailable. Please try again." },
    503
  )
}

export async function billingPost(
  request: Request,
  action: (user: User) => Promise<unknown>
): Promise<Response> {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) {
      throw new PolarBillingError(
        403,
        "Open billing from your Abstruck account."
      )
    }
    const user = await getCurrentUser()
    if (!user)
      throw new PolarBillingError(401, "Sign in to manage your billing.")
    return billingJson(await action(user))
  } catch (error) {
    return polarFailure(error)
  }
}
