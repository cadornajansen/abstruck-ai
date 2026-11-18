import { z } from "zod"

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .max(254, "Enter an email address with at most 254 characters.")
  .pipe(z.email({ error: "Enter a valid email address." }))

// Password spaces belong to the credential, so only email is trimmed.
const newPassword = z.string().min(8, "Use at least 8 characters.")
const emailForm = z.object({ email })

export const authSchemas = {
  "sign-in": z.object({
    email,
    password: z.string().min(1, "Enter your password."),
  }),
  "sign-up": z.object({ email, password: newPassword }),
  "reset-password": emailForm,
  "verify-email": emailForm,
  "update-password": z.object({ password: newPassword }),
} as const

export type AuthMode = keyof typeof authSchemas
export type AuthField = "email" | "password"
export type AuthFieldErrors = Partial<Record<AuthField, string>>

export function authFieldErrors(error: z.ZodError): AuthFieldErrors {
  const errors: AuthFieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if ((field === "email" || field === "password") && !errors[field]) {
      errors[field] = issue.message
    }
  }
  return errors
}
