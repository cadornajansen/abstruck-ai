import { getCurrentUser } from "@/lib/auth/session"
import {
  assessmentAiAttemptLimit,
  assessmentError,
  assessmentIdPattern,
  assessmentResult,
  isAssessmentObject,
} from "@/lib/assessments"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return assessmentError("Sign in to continue.", 401)
  const { id } = await params
  if (!assessmentIdPattern.test(id))
    return assessmentError("Assessment not found.", 404)
  const db = createAdminClient()
  const { data, error } = await db
    .from("attempts")
    .select("id,state,started_at,submitted_at,score,card_ids")
    .eq("owner_id", user.id)
    .eq("study_set_id", id)
    .in("mode", ["quiz", "exam"])
    .order("started_at", { ascending: false })
    .limit(25)
  if (error) return assessmentResult(null, error)
  if (!data.length)
    return assessmentResult({ attempt: null, attempts: [] }, null)
  const result = await db.rpc("get_assessment_attempt", {
    p_owner_id: user.id,
    p_attempt_id: data[0]!.id,
  })
  const current = isAssessmentObject(result.data) ? result.data : null
  const attempts = data.map((attempt) => ({
    attemptId: attempt.id,
    state:
      current?.attemptId === attempt.id && typeof current.state === "string"
        ? current.state
        : attempt.state,
    startedAt: attempt.started_at,
    submittedAt:
      current?.attemptId === attempt.id &&
      typeof current.submittedAt === "string"
        ? current.submittedAt
        : attempt.submitted_at,
    score:
      current?.attemptId === attempt.id && typeof current.score === "number"
        ? current.score
        : attempt.score,
    maxScore: attempt.card_ids.length,
  }))
  return assessmentResult(
    result.data ? { attempt: result.data, attempts } : null,
    result.error
  )
}

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
    typeof body.requestId !== "string" ||
    !assessmentIdPattern.test(body.requestId) ||
    (body.objectiveOnly !== undefined &&
      typeof body.objectiveOnly !== "boolean")
  )
    return assessmentError("Include a valid attempt request ID.", 400)
  const result = await createAdminClient().rpc("start_assessment_attempt", {
    p_owner_id: user.id,
    p_study_set_id: id,
    p_request_id: body.requestId,
    p_objective_only: body.objectiveOnly === true,
    p_ai_limit: assessmentAiAttemptLimit(),
  })
  return assessmentResult(result.data, result.error)
}
