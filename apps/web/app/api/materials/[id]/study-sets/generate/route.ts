import { getCurrentUser } from "@/lib/auth/session"
import { QUESTION_TYPES } from "@/lib/assessment-types"
import { getMaterial } from "@/lib/materials"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  STUDY_OUTPUT_TYPES,
  STUDY_OUTPUT_LIMITS,
  type StudyOutputType,
} from "@/lib/study-output-types"

export const runtime = "nodejs"
const types = ["summary", "flashcards", "quiz", "exam", ...STUDY_OUTPUT_TYPES]
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const mediaAvailable = !!(
    process.env.OPENAI_API_KEY &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  )
  return Response.json(
    {
      types,
      mediaAvailable,
      tools: types.map((type) => ({
        type,
        available: !["podcast", "video"].includes(type) || mediaAvailable,
        reason:
          ["podcast", "video"].includes(type) && !mediaAvailable
            ? "Audio and video generation is not configured."
            : null,
      })),
      limits: STUDY_OUTPUT_LIMITS,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to generate study tools." },
      { status: 401 }
    )
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Invalid request." }, { status: 415 })
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }
  if (
    !body ||
    !types.includes(String(body.type)) ||
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.requestId
    )
  ) {
    return Response.json(
      { error: "Choose an available study tool." },
      { status: 400 }
    )
  }
  const style = body.style ?? "detailed"
  const novel = STUDY_OUTPUT_TYPES.includes(body.type as StudyOutputType)
  const bounds = novel
    ? STUDY_OUTPUT_LIMITS[body.type as StudyOutputType]
    : null
  const count = body.count ?? bounds?.defaultCount ?? 10
  const pageStart = body.pageStart ?? 1
  const pageEnd = body.pageEnd ?? 200
  const assessment = body.type === "quiz" || body.type === "exam"
  const maxCount =
    bounds?.maxCount ?? (body.type === "exam" ? 40 : assessment ? 20 : 30)
  const questionTypes = body.questionTypes ?? [...QUESTION_TYPES]
  const durationMinutes = body.durationMinutes ?? null
  if (
    !["short", "detailed", "cheat-sheet"].includes(String(style)) ||
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < (bounds?.minCount ?? (assessment ? 1 : 5)) ||
    count > maxCount ||
    typeof pageStart !== "number" ||
    typeof pageEnd !== "number" ||
    !Number.isInteger(pageStart) ||
    !Number.isInteger(pageEnd) ||
    pageStart < 1 ||
    pageEnd > 200 ||
    pageEnd < pageStart ||
    (assessment &&
      (!Array.isArray(questionTypes) ||
        questionTypes.length < 1 ||
        questionTypes.length > 5 ||
        new Set(questionTypes).size !== questionTypes.length ||
        questionTypes.some((type) => !QUESTION_TYPES.includes(type)) ||
        (durationMinutes !== null &&
          (typeof durationMinutes !== "number" ||
            !Number.isInteger(durationMinutes) ||
            durationMinutes < 1 ||
            durationMinutes > 180))))
  ) {
    return Response.json(
      {
        error: `Check the generation settings: up to ${maxCount} items, a valid page range and an optional 1–180 minute time limit.`,
      },
      { status: 400 }
    )
  }
  const { id } = await params
  const material = await getMaterial(id)
  if (!material)
    return Response.json({ error: "Material not found." }, { status: 404 })
  if (!["ready", "partial"].includes(material.status))
    return Response.json(
      { error: "Wait for your material to finish processing." },
      { status: 409 }
    )
  const independent = material.source_type === "chat"
  const sourceIds = body.sourceIds ?? (independent ? [] : [id])
  if (
    !Array.isArray(sourceIds) ||
    (!independent && sourceIds.length < 1) ||
    sourceIds.length > 3 ||
    sourceIds.some(
      (source) => typeof source !== "string" || !/^[0-9a-f-]{36}$/i.test(source)
    ) ||
    (!independent && !sourceIds.includes(id)) ||
    new Set(sourceIds).size !== sourceIds.length ||
    (body.conversationId != null &&
      (typeof body.conversationId !== "string" ||
        !uuid.test(body.conversationId))) ||
    (independent &&
      !sourceIds.length &&
      typeof body.conversationId !== "string")
  ) {
    return Response.json(
      {
        error:
          "Choose up to three ready materials, or a saved conversation for an independent chat.",
      },
      { status: 400 }
    )
  }
  const db = createAdminClient()
  const { data, error } = await db.rpc("queue_study_generation", {
    p_owner_id: user.id,
    p_material_id: id,
    p_request_id: body.requestId,
    p_type: String(body.type),
    p_settings: {
      style: String(style),
      count,
      pageStart,
      pageEnd,
      ...(typeof body.conversationId === "string"
        ? { conversationId: body.conversationId }
        : {}),
      ...(assessment
        ? {
            questionTypes: questionTypes as string[],
            durationMinutes: durationMinutes as number | null,
          }
        : {}),
    },
    p_source_ids: sourceIds,
    p_limit: 3,
  })
  if (error) {
    const quota = error.message.includes("study_quota_exceeded")
    const busy = error.message.includes("job_concurrency_limit")
    return Response.json(
      {
        error: quota
          ? "You’ve used your study generations for this period. Your saved work is still available."
          : busy
            ? "Another study task is running. Wait for it to finish and try again."
            : "Generation could not start. Check your sources and try again.",
      },
      { status: quota || busy ? 429 : 409 }
    )
  }
  return Response.json(data, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  })
}
