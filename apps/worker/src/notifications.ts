import { createHash } from "node:crypto"
import type { WorkerClients } from "./jobs.js"

interface SupportPayload {
  subject: string
  message: string
  replyTo: string
  referenceKind: string | null
  referenceId: string | null
}
interface RenewalPayload {
  expiresAt: string
  stage: "day3" | "day1" | "expired"
}
interface OperationsPayload {
  day: string
  windowHours: number
  actualUsd: number
  reservedUsd: number
  queued: number
  staleQueued: number
  staleRunning: number
  staleWaiting: number
  failed: number
  reconciliationCount: number
  jobIds: string[]
  orderIds: string[]
}
interface NotificationIdentity {
  id: string
  owner_id: string
  dedupe_key: string
  lease_token: string
}
type NotificationJob = NotificationIdentity &
  (
    | { template: "support_request"; payload: SupportPayload }
    | { template: "renewal_reminder"; payload: RenewalPayload }
    | { template: "operations_digest"; payload: OperationsPayload }
  )
export type NotificationFunctions = {
  claim_notification_job: {
    Args: Record<string, never>
    Returns: NotificationJob | null
  }
  begin_notification_delivery: {
    Args: { p_id: string; p_lease_token: string; p_payload_hash: string }
    Returns: boolean
  }
  finish_notification_delivery: {
    Args: {
      p_id: string
      p_lease_token: string
      p_state: string
      p_provider_id?: string
      p_error?: string
    }
    Returns: boolean
  }
}
export class NotificationError extends Error {
  constructor(
    readonly code: string,
    readonly deliveryState: "retry" | "failed" | "uncertain"
  ) {
    super(code)
  }
}
interface EmailEnvelope {
  from: string
  to: string[]
  subject: string
  text: string
  reply_to: string
}
export function supportEmailEnvelope(delivery: {
  id: string
  owner_id: string
  payload: SupportPayload
}): EmailEnvelope {
  const from = process.env.EMAIL_FROM?.trim(),
    to = process.env.SUPPORT_EMAIL?.trim()
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !email.test(from.match(/<([^<>]+)>$/)?.[1] ?? from) ||
    !to ||
    !email.test(to) ||
    !email.test(delivery.payload.replyTo)
  )
    throw new NotificationError("notification_configuration_missing", "failed")
  return {
    from,
    to: [to],
    subject: `[Abstruck support] ${delivery.payload.subject}`,
    reply_to: delivery.payload.replyTo,
    text: `Support reference: ${delivery.id}\nAccount reference: ${delivery.owner_id}\n${delivery.payload.referenceId ? `Related ${delivery.payload.referenceKind}: ${delivery.payload.referenceId}\n` : ""}\n${delivery.payload.message}`,
  }
}

async function maintenanceEmailEnvelope(
  worker: WorkerClients,
  delivery: Exclude<NotificationJob, { template: "support_request" }>
): Promise<EmailEnvelope> {
  const from = process.env.EMAIL_FROM?.trim(),
    support = process.env.SUPPORT_EMAIL?.trim()
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  if (
    !from ||
    /[\r\n]/.test(from) ||
    !email.test(from.match(/<([^<>]+)>$/)?.[1] ?? from) ||
    !support ||
    !email.test(support)
  )
    throw new NotificationError("notification_configuration_missing", "failed")

  const account = await worker.supabase.auth.admin.getUserById(
    delivery.owner_id
  )
  if (account.error)
    throw new NotificationError("notification_account_unconfirmed", "retry")
  const user = account.data.user
  if (
    !user?.email ||
    !email.test(user.email) ||
    !user.email_confirmed_at ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())
  )
    throw new NotificationError("notification_account_unavailable", "failed")

  let origin: URL
  try {
    origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "")
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password
    )
      throw new Error("invalid_origin")
  } catch {
    throw new NotificationError("notification_configuration_missing", "failed")
  }
  const base = { from, reply_to: support }
  if (delivery.template === "renewal_reminder") {
    const expiry = new Date(delivery.payload.expiresAt)
    if (!Number.isFinite(expiry.getTime()))
      throw new NotificationError("notification_payload_invalid", "failed")
    const expired = delivery.payload.stage === "expired"
    return {
      ...base,
      to: [user.email],
      subject: expired
        ? "Your Abstruck paid period has ended"
        : "Your Abstruck paid period is ending soon",
      text: `Your paid access ${expired ? "ended" : "ends"} on ${expiry.toISOString()} (UTC).\n\n${expired ? "Your account now uses Free allowances. Your study content is preserved. New uploads are blocked if your retained files exceed the Free storage allowance." : "Visit Plan & Billing to review your subscription."}\n\nView your plan and renewal options: ${new URL("/billing", origin.origin).href}\n\nReference: ${delivery.id}`,
    }
  }
  const founders = (process.env.ABSTRUCK_ADMIN_USER_IDS ?? "")
    .split(/[\s,]+/)
    .map((id) => id.toLowerCase())
  if (!founders.includes(delivery.owner_id.toLowerCase()))
    throw new NotificationError("notification_founder_unavailable", "failed")
  const data = delivery.payload
  return {
    ...base,
    to: [support],
    subject: `[Abstruck operations] Daily digest · ${data.day}`,
    text: `Last ${data.windowHours} hours · ${data.day} UTC\nActual metered provider cost: US$${Number(data.actualUsd).toFixed(6)}\nReserved provider cost: US$${Number(data.reservedUsd).toFixed(6)}\n\nQueued jobs: ${data.queued}\nQueued over 15 minutes: ${data.staleQueued}\nRunning with an expired lease: ${data.staleRunning}\nWaiting on a provider over 30 minutes: ${data.staleWaiting}\nJobs failed in the last 24 hours: ${data.failed}\nPayments needing reconciliation: ${data.reconciliationCount}\n\nUp to five stale job references: ${data.jobIds.join(", ") || "None"}\nUp to five payment references: ${data.orderIds.join(", ") || "None"}\n\nReview guarded recovery and payment status: ${new URL("/operations", origin.origin).href}\nA stale count is a prompt to inspect status, not permission to repeat an uncertain provider request. Costs cover the application ledger, not unmetered hosting or external charges.\n\nReference: ${delivery.id}`,
  }
}

/** Fixed endpoint and same idempotency key/payload on every bounded recovery attempt. */
export async function sendSupportEmail(
  envelope: EmailEnvelope,
  dedupeKey: string
): Promise<string> {
  const key = process.env.RESEND_API_KEY
  if (!key || /[\r\n]/.test(key))
    throw new NotificationError("notification_configuration_missing", "failed")
  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": dedupeKey,
      },
      body: JSON.stringify(envelope),
    })
  } catch {
    throw new NotificationError("notification_outcome_unconfirmed", "retry")
  }
  if (!response.body)
    throw new NotificationError("notification_outcome_unconfirmed", "retry")
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength
      if (bytes > 32768) throw new Error("response_limit")
      chunks.push(chunk)
    }
  } catch {
    throw new NotificationError("notification_outcome_unconfirmed", "retry")
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >
  } catch {
    throw new NotificationError("notification_outcome_unconfirmed", "retry")
  }
  if (!response.ok) {
    if (
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 409 &&
        body.name === "concurrent_idempotent_requests")
    )
      throw new NotificationError("notification_retry_pending", "retry")
    if (response.status === 409)
      throw new NotificationError(
        "notification_idempotency_unconfirmed",
        "uncertain"
      )
    throw new NotificationError("notification_provider_rejected", "failed")
  }
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    throw new NotificationError("notification_outcome_unconfirmed", "retry")
  return body.id
}

export async function processNotificationJob(
  worker: WorkerClients
): Promise<boolean> {
  const claimed = await worker.supabase.rpc("claim_notification_job", {})
  if (claimed.error) throw new Error("notification_queue_unavailable")
  const delivery = claimed.data
  if (!delivery) return false
  try {
    const envelope =
      delivery.template === "support_request"
        ? supportEmailEnvelope(delivery)
        : await maintenanceEmailEnvelope(worker, delivery)
    const started = await worker.supabase.rpc("begin_notification_delivery", {
      p_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_payload_hash: createHash("sha256")
        .update(JSON.stringify(envelope))
        .digest("hex"),
    })
    if (started.error)
      throw new NotificationError(
        "notification_payload_unconfirmed",
        "uncertain"
      )
    if (!started.data) return true
    const providerId = await sendSupportEmail(envelope, delivery.dedupe_key)
    const saved = await worker.supabase.rpc("finish_notification_delivery", {
      p_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_state: "sent",
      p_provider_id: providerId,
    })
    if (saved.error || !saved.data)
      throw new NotificationError(
        "notification_receipt_checkpoint_pending",
        "retry"
      )
    console.log(
      JSON.stringify({ event: "notification_sent", deliveryId: delivery.id })
    )
  } catch (error) {
    const state =
        error instanceof NotificationError ? error.deliveryState : "retry",
      code =
        error instanceof NotificationError
          ? error.code
          : "notification_outcome_unconfirmed"
    await worker.supabase.rpc("finish_notification_delivery", {
      p_id: delivery.id,
      p_lease_token: delivery.lease_token,
      p_state: state,
      p_error: code,
    })
    console.log(
      JSON.stringify({
        event: "notification_checkpoint",
        deliveryId: delivery.id,
        state,
        reason: code,
      })
    )
  }
  return true
}
