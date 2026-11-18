"use server"

import { redirect } from "next/navigation"
import type { AuthError } from "@supabase/supabase-js"

import { safeNextPath } from "@/lib/auth/redirect"
import { ensureProfile, requireUser } from "@/lib/auth/session"
import { authSchemas } from "@/lib/auth/validation"
import { createClient } from "@/lib/supabase/server"

export type AuthFeedback = {
  error?: string
  message?: string
  retryAfterSeconds?: number
}

function authFailure(error: AuthError, signingUp = false): AuthFeedback {
  // Codes/status are sufficient for diagnosis; never log credentials or email.
  console.warn("[auth]", { code: error.code, status: error.status })
  if (error.code === "request_timeout" || error.status === 504)
    return {
      error: signingUp
        ? "The verification email request timed out. Try again, or continue with Google."
        : "Sign-in timed out. Please try again.",
    }
  if (error.code?.startsWith("over_"))
    return { error: "Too many attempts. Please wait before trying again." }
  if (error.code === "email_not_confirmed")
    return {
      error: "Confirm your email before signing in, or continue with Google.",
    }
  if (error.code === "weak_password")
    return { error: "Use a stronger password with at least 8 characters." }
  if (error.code === "user_already_exists")
    return {
      error: "Try signing in or resetting your password for this email.",
    }
  if (
    error.code === "email_address_invalid" ||
    error.code === "validation_failed"
  )
    return { error: "Check your email address and password, then try again." }
  return {
    error: signingUp
      ? "We couldn’t create your account. Try again, or continue with Google."
      : "We couldn’t sign you in. Check your email and password, then try again.",
  }
}

function authRedirect(
  path: string,
  key: "message" | "error",
  text: string,
  next = "/"
): never {
  const params = new URLSearchParams({ [key]: text, next: safeNextPath(next) })
  redirect(`${path}?${params}`)
}

function credentials(formData: FormData): {
  email: string
  password: string
  next: string
} {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: safeNextPath(formData.get("next")),
  }
}

function callbackUrl(next: string): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const url = new URL("/auth/callback", origin)
  url.searchParams.set("next", safeNextPath(next))
  return url.toString()
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(next) },
  })
  if (error || !data.url)
    authRedirect(
      "/sign-in",
      "error",
      "Google sign-in could not start. Please try again.",
      next
    )
  redirect(data.url)
}

export async function signIn(
  _previous: AuthFeedback,
  formData: FormData
): Promise<AuthFeedback> {
  const { email, password, next } = credentials(formData)
  const validation = authSchemas["sign-in"].safeParse({ email, password })
  if (!validation.success)
    return {
      error: validation.error.issues[0]?.message ?? "Check your details.",
    }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) return authFailure(error)
  await ensureProfile(data.user)
  redirect(next)
}

export async function signUp(
  _previous: AuthFeedback,
  formData: FormData
): Promise<AuthFeedback> {
  const { email, password, next } = credentials(formData)
  const validation = authSchemas["sign-up"].safeParse({ email, password })
  if (!validation.success)
    return {
      error: validation.error.issues[0]?.message ?? "Check your details.",
    }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(next) },
  })
  if (error) return authFailure(error, true)
  if (data.session && data.user) {
    await ensureProfile(data.user)
    redirect(next)
  }
  authRedirect(
    "/sign-in",
    "message",
    "Check your email to confirm your account, then sign in.",
    next
  )
}

export async function resendVerificationEmail(
  _previous: AuthFeedback,
  formData: FormData
): Promise<AuthFeedback> {
  const email = String(formData.get("email") ?? "").trim()
  const next = safeNextPath(formData.get("next"))
  const validation = authSchemas["verify-email"].safeParse({ email })
  if (!validation.success)
    return { error: validation.error.issues[0]?.message ?? "Check your email." }
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: callbackUrl(next) },
    })
    if (error)
      console.warn("[auth.resend]", { code: error.code, status: error.status })
  } catch {
    console.warn("[auth.resend]", { code: "request_unconfirmed" })
  }
  // Eligibility and provider throttling must not reveal account existence.
  return {
    message:
      "If this address is awaiting confirmation, check your inbox and spam folder for a verification link. Please wait before requesting another.",
  }
}

export async function resetPassword(
  _previous: AuthFeedback,
  formData: FormData
): Promise<AuthFeedback> {
  const email = String(formData.get("email") ?? "").trim()
  const validation = authSchemas["reset-password"].safeParse({ email })
  if (!validation.success)
    return { error: validation.error.issues[0]?.message ?? "Check your email." }
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl("/update-password"),
    })
    if (error) {
      console.warn("[auth.reset]", { code: error.code, status: error.status })
      if (error.status === 429 || error.code?.startsWith("over_"))
        return {
          error:
            "Email requests are temporarily limited. Please wait before trying again, and check your inbox and spam for an earlier link.",
          retryAfterSeconds: 60,
        }
      return {
        error: "We could not send the reset link. Please try again shortly.",
        retryAfterSeconds: 60,
      }
    }
    return {
      message:
        "If an account exists for that email, check your inbox and spam folder for a password reset link. Open it in this browser.",
      retryAfterSeconds: 60,
    }
  } catch {
    console.warn("[auth.reset]", { code: "request_unconfirmed" })
    return {
      error:
        "We could not confirm the email request. Check your inbox before trying again.",
      retryAfterSeconds: 60,
    }
  }
}

export async function updatePassword(
  _previous: AuthFeedback,
  formData: FormData
): Promise<AuthFeedback> {
  await requireUser("/update-password")
  const password = String(formData.get("password") ?? "")
  const validation = authSchemas["update-password"].safeParse({ password })
  if (!validation.success)
    return {
      error: validation.error.issues[0]?.message ?? "Check your password.",
    }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error)
    authRedirect(
      "/update-password",
      "error",
      "Your password could not be updated. Request a new reset link and try again."
    )
  await supabase.auth.signOut()
  authRedirect(
    "/sign-in",
    "message",
    "Password updated. Sign in with your new password."
  )
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error("You could not be signed out. Please try again.")
  redirect("/sign-in")
}
