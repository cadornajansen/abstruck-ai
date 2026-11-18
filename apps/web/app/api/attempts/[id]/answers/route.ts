import { getCurrentUser } from "@/lib/auth/session"
import {
  assessmentError,
  assessmentIdPattern,
  assessmentResult,
  isAssessmentObject,
} from "@/lib/assessments"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"

export const runtime = "nodejs"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return assessmentError("Sign in to continue.", 401)
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !assessmentIdPattern.test(id) ||
    !isAssessmentObject(body) ||
    typeof body.questionId !== "string" ||
    !assessmentIdPattern.test(body.questionId) ||
    typeof body.requestId !== "string" ||
    !assessmentIdPattern.test(body.requestId) ||
    typeof body.revision !== "number" ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 1 ||
    body.revision > 2147483646 ||
    !isAssessmentObject(body.response) ||
    JSON.stringify(body.response).length > 10000 ||
    (body.final !== undefined && typeof body.final !== "boolean") ||
    (body.marked !== undefined && typeof body.marked !== "boolean")
  )
    return assessmentError(
      "Include the question, answer, request ID and saved revision.",
      400
    )
  const result = await createAdminClient().rpc("save_assessment_answer", {
    p_owner_id: user.id,
    p_attempt_id: id,
    p_question_id: body.questionId,
    p_request_id: body.requestId,
    p_revision: body.revision,
    p_response: body.response as Json,
    p_final: body.final === true,
    p_marked: body.marked === true,
  })
  return assessmentResult(result.data, result.error)
}
