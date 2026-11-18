import { getCurrentUser } from "@/lib/auth/session"
import {
  assessmentError,
  assessmentIdPattern,
  assessmentResult,
  isAssessmentObject,
} from "@/lib/assessments"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function POST(
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
    !assessmentIdPattern.test(body.questionId)
  )
    return assessmentError("Include the question you want reviewed.", 400)
  const result = await createAdminClient().rpc("report_assessment_answer", {
    p_owner_id: user.id,
    p_attempt_id: id,
    p_question_id: body.questionId,
  })
  return assessmentResult(result.data, result.error)
}
