import "server-only"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Tables } from "@/lib/supabase/database.types"
import type {
  SupportInput,
  SupportReceipt,
  SupportResponse,
} from "@/lib/operations-types"
import { OperationsError, operationsUuid } from "@/lib/operations"

function receipt(row: Tables<"notification_deliveries">): SupportReceipt {
  return {
    id: row.id,
    status: row.state as SupportReceipt["status"],
    createdAt: row.created_at,
    sentAt: row.sent_at,
    error:
      row.state === "failed"
        ? "Your message could not be delivered. You can explicitly send a new request."
        : row.state === "uncertain"
          ? "Delivery could not be confirmed. Keep this reference and check status; the message will not be sent again automatically."
          : null,
  }
}
export function supportInput(body: Record<string, unknown>): SupportInput {
  const { requestId, subject, message, reference } = body
  if (
    typeof requestId !== "string" ||
    !operationsUuid.test(requestId) ||
    typeof subject !== "string" ||
    !subject.trim() ||
    subject.trim().length > 120 ||
    /[\u0000-\u001f\u007f]/.test(subject) ||
    typeof message !== "string" ||
    message.trim().length < 20 ||
    message.trim().length > 4000 ||
    message.includes("\u0000")
  )
    throw new OperationsError(
      400,
      "Use a subject of 1–120 characters and a message of 20–4,000 characters."
    )
  let related: SupportInput["reference"]
  if (reference !== undefined) {
    if (
      !reference ||
      typeof reference !== "object" ||
      Array.isArray(reference) ||
      !("kind" in reference) ||
      !["job", "order"].includes(String(reference.kind)) ||
      !("id" in reference) ||
      typeof reference.id !== "string" ||
      !operationsUuid.test(reference.id)
    )
      throw new OperationsError(400, "Use an owned job or order reference.")
    related = { kind: reference.kind as "job" | "order", id: reference.id }
  }
  return {
    requestId,
    subject: subject.trim(),
    message: message.trim(),
    ...(related ? { reference: related } : {}),
  }
}
export async function submitSupport(
  input: SupportInput
): Promise<SupportResponse> {
  const user = await getCurrentUser()
  if (!user) throw new OperationsError(401, "Sign in to contact support.")
  if (!user.email || !user.email_confirmed_at)
    throw new OperationsError(
      403,
      "Verify your email before sending a support request."
    )
  const result = await createAdminClient().rpc("request_support", {
    p_owner_id: user.id,
    p_request_id: input.requestId,
    p_subject: input.subject,
    p_message: input.message,
    p_reply_to: user.email,
    ...(input.reference
      ? {
          p_reference_kind: input.reference.kind,
          p_reference_id: input.reference.id,
        }
      : {}),
  })
  if (result.error) {
    if (result.error.message.includes("support_rate_limit"))
      throw new OperationsError(
        429,
        "You have reached the support request limit for today. Check your existing request or try later."
      )
    if (result.error.message.includes("reference_unavailable"))
      throw new OperationsError(
        400,
        "That job or order reference is not available to your account."
      )
    if (result.error.message.includes("request_conflict"))
      throw new OperationsError(
        409,
        "This request ID belongs to different content. Keep its reference and start a new explicit request."
      )
    throw new Error("support_unavailable")
  }
  return {
    request: receipt(
      result.data as unknown as Tables<"notification_deliveries">
    ),
  }
}
export async function getSupport(id?: string): Promise<SupportResponse> {
  const user = await getCurrentUser()
  if (!user) throw new OperationsError(401, "Sign in to view support requests.")
  if (id && !operationsUuid.test(id))
    throw new OperationsError(400, "Use a valid request reference.")
  let query = createAdminClient()
    .from("notification_deliveries")
    .select("*")
    .eq("owner_id", user.id)
    .eq("template", "support_request")
    .order("created_at", { ascending: false })
    .limit(1)
  if (id) query = query.eq("id", id)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error("support_unavailable")
  if (id && !data) throw new OperationsError(404, "Support request not found.")
  return { request: data ? receipt(data) : null }
}
