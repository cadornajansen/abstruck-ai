import { getCurrentUser } from "@/lib/auth/session"
import {
  assessmentError,
  assessmentIdPattern,
  assessmentResult,
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
    return assessmentError("Attempt not found.", 404)
  const result = await createAdminClient().rpc("get_assessment_attempt", {
    p_owner_id: user.id,
    p_attempt_id: id,
  })
  if (!result.data && !result.error)
    return assessmentError("Attempt not found.", 404)
  return assessmentResult(
    result.data ? { attempt: result.data } : null,
    result.error
  )
}
