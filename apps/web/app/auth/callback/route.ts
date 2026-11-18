import { NextResponse, type NextRequest } from "next/server"

import { safeNextPath } from "@/lib/auth/redirect"
import { ensureProfile } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code")
  const next = safeNextPath(request.nextUrl.searchParams.get("next"))
  const supabase = await createClient()
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      await ensureProfile(data.user)
      return NextResponse.redirect(new URL(next, request.url))
    }
  }
  const destination = new URL("/sign-in", request.url)
  destination.searchParams.set("next", next)
  destination.searchParams.set(
    "error",
    "That link is invalid or expired. Request a new link and try again."
  )
  return NextResponse.redirect(destination)
}
