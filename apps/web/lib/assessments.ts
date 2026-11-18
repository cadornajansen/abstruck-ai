import "server-only"

import type { Json } from "@/lib/supabase/database.types"

export const assessmentHeaders = { "Cache-Control": "private, no-store" }
export const assessmentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isAssessmentObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function assessmentError(
  error: string,
  status: number,
  code?: string
): Response {
  return Response.json({ error, code }, { status, headers: assessmentHeaders })
}

const errors: Record<string, string> = {
  not_found: "This assessment could not be found.",
  not_ready: "Your questions are still being prepared.",
  request_conflict: "This request was already used. Reload your saved attempt.",
  revision_conflict: "A newer answer was saved. Review it before changing it.",
  answer_locked: "This answer has already been checked.",
  attempt_submitted: "This attempt has already been submitted.",
  deadline_passed: "Time is up. Your saved answers have been submitted.",
  ai_grading_limit:
    "You have reached the AI review limit for this set this period. You can still practise its objective questions.",
  no_objective_questions: "This set has no objective questions to practise.",
  invalid_response:
    "Choose valid options or enter an answer under 2,000 characters.",
  invalid_question: "This question does not belong to this attempt.",
  answer_not_checked: "Check or submit this answer before requesting review.",
}

export function assessmentResult(data: Json | null, error: unknown): Response {
  if (error || data === null)
    return assessmentError(
      "Your assessment could not be saved. Please try again.",
      503
    )
  if (isAssessmentObject(data) && typeof data.error === "string") {
    const code = data.error
    const status =
      code === "not_found"
        ? 404
        : code === "ai_grading_limit"
          ? 429
          : [
                "request_conflict",
                "revision_conflict",
                "answer_locked",
                "attempt_submitted",
                "deadline_passed",
                "not_ready",
              ].includes(code)
            ? 409
            : 400
    return Response.json(
      {
        ...data,
        code,
        error: errors[code] ?? "Check your assessment request and try again.",
      },
      { status, headers: assessmentHeaders }
    )
  }
  return Response.json(data, { headers: assessmentHeaders })
}

export function assessmentAiAttemptLimit(): number {
  const configured = Number(process.env.ASSESSMENT_AI_ATTEMPTS_PER_SET ?? 3)
  return Number.isInteger(configured) && configured >= 1 && configured <= 3
    ? configured
    : 3
}
