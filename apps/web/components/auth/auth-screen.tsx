"use client"

import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { Eye, EyeClosed } from "iconoir-react"
import Image from "next/image"

import { Brand } from "@/components/workspace/brand"
import type { AuthFeedback } from "@/app/auth/actions"
import {
  authFieldErrors,
  authSchemas,
  type AuthField,
  type AuthFieldErrors,
  type AuthMode,
} from "@/lib/auth/validation"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Spinner } from "@workspace/ui/components/spinner"

export type { AuthMode } from "@/lib/auth/validation"

type AuthScreenProps = {
  mode: AuthMode
  action: (previous: AuthFeedback, formData: FormData) => Promise<AuthFeedback>
  googleAction?: (formData: FormData) => Promise<void>
  message?: string
  error?: string
  next?: string
}

const copy: Record<
  AuthMode,
  { title: string; description: string; submit: string }
> = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to your Abstruck account",
    submit: "Sign in",
  },
  "sign-up": {
    title: "Create an account",
    description: "Bring your studies together with Abstruck",
    submit: "Create account",
  },
  "reset-password": {
    title: "Forgot password?",
    description: "Enter your email and we’ll send you a reset link.",
    submit: "Send password reset",
  },
  "update-password": {
    title: "Choose a new password",
    description: "Set a new password for your Abstruck account.",
    submit: "Update password",
  },
  "verify-email": {
    title: "Verify your email",
    description:
      "Enter the email used for sign-up. Open the confirmation link in the same browser.",
    submit: "Resend verification email",
  },
}

function SubmitButton({
  children,
  google = false,
  retryIn = 0,
}: {
  children: string
  google?: boolean
  retryIn?: number
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={google ? "outline" : "default"}
      disabled={pending || retryIn > 0}
      className="h-12 w-full gap-3 rounded-2xl text-sm shadow-sm"
    >
      {pending ? (
        <Spinner />
      ) : google ? (
        <Image
          src="/brands/google.svg"
          width={18}
          height={18}
          alt=""
          unoptimized
        />
      ) : null}
      {pending
        ? "Please wait…"
        : retryIn > 0
          ? `Try again in ${retryIn}s`
          : children}
    </Button>
  )
}

export function AuthScreen({
  mode,
  action,
  googleAction,
  message,
  error,
  next = "/",
}: AuthScreenProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({})
  const [retryIn, setRetryIn] = useState(0)
  const [feedback, submit] = useActionState(action, { error, message })
  useEffect(() => {
    if (!feedback.retryAfterSeconds) return
    const expiresAt = Date.now() + feedback.retryAfterSeconds * 1000
    setRetryIn(feedback.retryAfterSeconds)
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
      setRetryIn(remaining)
      if (remaining === 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [feedback])
  const content = copy[mode]
  const hasPassword =
    mode === "sign-in" || mode === "sign-up" || mode === "update-password"
  const hasEmail = mode !== "update-password"
  const accountEntry = mode === "sign-in" || mode === "sign-up"
  const destination = encodeURIComponent(next)

  function validateField(field: AuthField, value: string): void {
    const result = authSchemas[mode].safeParse({
      email,
      password,
      [field]: value,
    })
    const message = result.success
      ? undefined
      : authFieldErrors(result.error)[field]
    setFieldErrors((current) => ({ ...current, [field]: message }))
  }

  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-6 py-12 sm:pt-36">
      <div className="flex w-full max-w-96 flex-col items-center">
        <Brand href="/" />
        <header className="mt-9 mb-8 text-center">
          <h1 className="text-2xl font-medium tracking-tight">
            {content.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {content.description}
          </p>
        </header>

        {accountEntry && googleAction && (
          <>
            <form action={googleAction} className="w-full">
              <input type="hidden" name="next" value={next} />
              <SubmitButton google>Continue with Google</SubmitButton>
            </form>
            <div className="my-7 flex w-full items-center gap-4 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or continue with email</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form
          action={submit}
          noValidate
          className="w-full"
          onSubmit={(event) => {
            const formData = new FormData(event.currentTarget)
            const result = authSchemas[mode].safeParse({
              email: formData.get("email"),
              password: formData.get("password"),
            })
            if (result.success) {
              setFieldErrors({})
              return
            }
            event.preventDefault()
            const errors = authFieldErrors(result.error)
            setFieldErrors(errors)
            const field = errors.email ? "email" : "password"
            const control = event.currentTarget.elements.namedItem(field)
            if (control instanceof HTMLElement) control.focus()
          }}
        >
          <input type="hidden" name="next" value={next} />
          <FieldGroup className="gap-5">
            {hasEmail && (
              <Field data-invalid={!!fieldErrors.email}>
                <FieldLabel htmlFor="auth-email" className="sr-only">
                  Email
                </FieldLabel>
                <Input
                  id="auth-email"
                  name="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setFieldErrors((current) => ({
                      ...current,
                      email: undefined,
                    }))
                  }}
                  onBlur={(event) => validateField("email", event.target.value)}
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  placeholder="Enter your email"
                  required
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={
                    fieldErrors.email ? "auth-email-error" : undefined
                  }
                  className="h-12 rounded-2xl px-4"
                />
                {fieldErrors.email && (
                  <FieldError id="auth-email-error">
                    {fieldErrors.email}
                  </FieldError>
                )}
              </Field>
            )}
            {hasPassword && (
              <Field data-invalid={!!fieldErrors.password}>
                <FieldLabel htmlFor="auth-password" className="sr-only">
                  {mode === "update-password" ? "New password" : "Password"}
                </FieldLabel>
                <InputGroup className="h-12 rounded-2xl">
                  <InputGroupInput
                    id="auth-password"
                    name="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setFieldErrors((current) => ({
                        ...current,
                        password: undefined,
                      }))
                    }}
                    onBlur={(event) =>
                      validateField("password", event.target.value)
                    }
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                    minLength={mode === "sign-in" ? undefined : 8}
                    required
                    placeholder={
                      mode === "update-password"
                        ? "Enter your new password"
                        : "Enter your password"
                    }
                    className="h-full pl-4"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={
                      fieldErrors.password
                        ? "auth-password-error"
                        : mode !== "sign-in"
                          ? "password-guidance"
                          : undefined
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="rounded-full"
                    >
                      {showPassword ? (
                        <EyeClosed aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {mode === "sign-in" && (
                  <a
                    href="/reset-password"
                    className="self-end text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </a>
                )}
                {mode !== "sign-in" && !fieldErrors.password && (
                  <p
                    id="password-guidance"
                    className="text-xs text-muted-foreground"
                  >
                    Use at least 8 characters.
                  </p>
                )}
                {fieldErrors.password && (
                  <FieldError id="auth-password-error">
                    {fieldErrors.password}
                  </FieldError>
                )}
              </Field>
            )}
            {feedback.error && (
              <Alert variant="destructive">
                <AlertDescription>{feedback.error}</AlertDescription>
              </Alert>
            )}
            {feedback.message && (
              <Alert role="status">
                <AlertDescription>{feedback.message}</AlertDescription>
              </Alert>
            )}
            <SubmitButton retryIn={retryIn}>{content.submit}</SubmitButton>
          </FieldGroup>
        </form>

        <p className="mt-7 text-center text-sm text-muted-foreground">
          {mode === "sign-in" ? (
            <>
              Don’t have an account?{" "}
              <a
                href={`/sign-up?next=${destination}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign up
              </a>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <a
                href={`/sign-in?next=${destination}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Sign in
              </a>
            </>
          )}
        </p>
        {mode === "sign-in" && (
          <a
            href={`/verify-email?next=${destination}`}
            className="mt-4 rounded-sm text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Resend verification email
          </a>
        )}
        <nav
          aria-label="Public information"
          className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
        >
          {(["pricing", "privacy", "terms"] as const).map((page) => (
            <a
              key={page}
              href={`/${page}`}
              className="rounded-sm capitalize underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {page}
            </a>
          ))}
        </nav>
      </div>
    </main>
  )
}
