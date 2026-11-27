import "server-only"

import { isPolarBillingConfigured } from "@/lib/polar-config"
import type { User } from "@supabase/supabase-js"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import type { OperationsOverview } from "@/lib/operations-types"

export const operationsUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const operationsHeaders = { "Cache-Control": "private, no-store" }
export class OperationsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly auditId?: string
  ) {
    super(message)
  }
}
export function isFounder(user: User): boolean {
  const ids = (process.env.ABSTRUCK_ADMIN_USER_IDS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
  return (
    operationsUuid.test(user.id) &&
    ids.length > 0 &&
    ids.every((id) => operationsUuid.test(id)) &&
    ids.some((id) => id.toLowerCase() === user.id.toLowerCase())
  )
}
export async function requireFounder(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new OperationsError(401, "Sign in to open operations.")
  if (!isFounder(user))
    throw new OperationsError(403, "Founder access is required.")
  return user
}
export async function readOperationsInput(
  request: Request,
  limit = 4096
): Promise<Record<string, unknown>> {
  if (
    !request.body ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new OperationsError(400, "Use a valid request.")
  const chunks: Uint8Array[] = []
  let bytes = 0
  const reader = request.body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) {
        await reader.cancel()
        throw new OperationsError(413, "This request is too large.")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new OperationsError(400, "Use a valid request.")
  return body as Record<string, unknown>
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
export function operationsFailure(error: unknown): Response {
  const status =
    error instanceof OperationsError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 503
  return Response.json(
    {
      error:
        error instanceof OperationsError
          ? error.message
          : status === 400
            ? "Check the request and try again."
            : "This operation could not be completed. Keep the request reference and try again.",
      ...(error instanceof OperationsError && error.auditId
        ? { auditId: error.auditId }
        : {}),
    },
    { status, headers: operationsHeaders }
  )
}

/** Every caller is guarded here as well as at the route boundary. No configuration values leave this module. */
export async function getOperationsOverview(): Promise<OperationsOverview> {
  await requireFounder()
  const { data, error } = await createAdminClient().rpc("operations_snapshot")
  if (error || !object(data)) throw new Error("operations_unavailable")
  const overview = data as unknown as Omit<OperationsOverview, "services">
  const configured = (...names: string[]) =>
    names.every((name) => !!process.env[name])
  const service = (
    name: string,
    present: boolean,
    detail: string
  ): OperationsOverview["services"][number] => ({
    name,
    state: present ? "configured" : "not_configured",
    detail: present ? detail : "Configuration is unavailable.",
  })
  return {
    ...overview,
    services: [
      {
        name: "Database",
        state: "available",
        detail: "Overview query completed.",
      },
      {
        name: "Worker",
        state: "unknown",
        detail: overview.jobs[0]
          ? `Last job checkpoint: ${overview.jobs[0].updatedAt}. Queue state is not a worker heartbeat.`
          : "No job checkpoint is available.",
      },
      service(
        "Private storage",
        configured(
          "R2_ACCOUNT_ID",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_BUCKET"
        ),
        "Configured; no live storage probe was run."
      ),
      service(
        "OpenAI",
        configured("OPENAI_API_KEY"),
        "Configured; provider health was not probed."
      ),
      service(
        "AssemblyAI",
        configured("ASSEMBLYAI_API_KEY"),
        "Configured; provider health was not probed."
      ),
      service(
        "Polar",
        isPolarBillingConfigured(),
        "Hosted checkout and subscription billing are configured."
      ),
      service(
        "Support email",
        configured("RESEND_API_KEY", "EMAIL_FROM", "SUPPORT_EMAIL"),
        "Configured; sending is confirmed only by a provider receipt."
      ),
    ],
  }
}

export async function retryOperationsJob(
  id: string,
  requestId: string
): Promise<Json> {
  const actor = await requireFounder()
  const { data, error } = await createAdminClient().rpc(
    "operations_retry_job",
    { p_actor_id: actor.id, p_job_id: id, p_request_id: requestId }
  )
  if (error || !object(data)) throw new Error("retry_unavailable")
  if (data.blocked === true)
    throw new OperationsError(
      409,
      typeof data.error === "string"
        ? data.error
        : "This job cannot be safely retried.",
      requestId
    )
  return data as Json
}
