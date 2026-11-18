import { notFound, redirect } from "next/navigation"
import type { AssessmentPageProps } from "@/components/workspace/assessment-page"
import { AssessmentWorkspace } from "@/components/workspace/assessment-workspace"
import { getSpaces } from "@/lib/spaces"
import { getProfile } from "@/lib/profile"
import { getRecentMaterials } from "@/lib/library"
import { signOut } from "@/app/auth/actions"
import { createSpace } from "@/app/actions/spaces"
import { requireUser } from "@/lib/auth/session"
import { getLibraryMaterials } from "@/lib/library"
import { getStudySetDetail } from "@/lib/study-sets"
import { getMaterial } from "@/lib/materials"
import { createClient } from "@/lib/supabase/server"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AssessmentRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    materialId?: string | string[]
    attempt?: string | string[]
    conversationId?: string | string[]
    sourceIds?: string | string[]
  }>
}) {
  const { id } = await params
  const query = await searchParams
  const user = await requireUser(`/assessments/${id}`)

  async function workspace(assessment: AssessmentPageProps) {
    const [spaces, profile, recentMaterials] = await Promise.all([
      getSpaces(user.id),
      getProfile(user.id),
      getRecentMaterials(user.id),
    ])
    return (
      <AssessmentWorkspace
        assessment={assessment}
        spaces={spaces}
        recentMaterials={recentMaterials}
        userName={profile?.display_name ?? "Your workspace"}
        signOutAction={signOut}
        createSpaceAction={createSpace}
      />
    )
  }

  if (id === "new") {
    const materials = await getLibraryMaterials(user.id)
    const sources = materials
      .filter(
        (material) =>
          material.source_type !== "chat" &&
          ["ready", "partial"].includes(material.status)
      )
      .map(({ id: materialId, title }) => ({ id: materialId, title }))
    const requested =
      typeof query.materialId === "string" ? query.materialId : null
    if (query.materialId !== undefined && (!requested || !uuid.test(requested)))
      notFound()
    const conversationId =
      typeof query.conversationId === "string" ? query.conversationId : null
    if (
      query.conversationId !== undefined &&
      (!conversationId || !uuid.test(conversationId) || !requested)
    )
      notFound()
    if (
      query.sourceIds !== undefined &&
      (typeof query.sourceIds !== "string" || query.sourceIds.length > 110)
    )
      notFound()
    const initialSourceIds =
      typeof query.sourceIds === "string"
        ? query.sourceIds
          ? query.sourceIds.split(",")
          : []
        : undefined
    if (
      initialSourceIds &&
      (initialSourceIds.length > 3 ||
        new Set(initialSourceIds).size !== initialSourceIds.length ||
        initialSourceIds.some(
          (sourceId) =>
            !uuid.test(sourceId) ||
            !sources.some((source) => source.id === sourceId)
        ))
    )
      notFound()
    const material = requested ? await getMaterial(requested) : null
    if (
      requested &&
      (!material || !["ready", "partial"].includes(material.status))
    )
      notFound()
    const independent = material?.source_type === "chat"
    if (
      requested &&
      !independent &&
      !sources.some((source) => source.id === requested)
    )
      notFound()
    if (initialSourceIds?.length === 0 && (!independent || !conversationId))
      notFound()
    if (conversationId && requested) {
      const db = await createClient()
      const { data: conversation, error } = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("material_id", requested)
        .eq("owner_id", user.id)
        .maybeSingle()
      if (error || !conversation) notFound()
    }
    if (requested) {
      const context = new URLSearchParams({ exam: "new" })
      if (initialSourceIds) context.set("sourceIds", initialSourceIds.join(","))
      if (conversationId) context.set("conversation", conversationId)
      redirect(`/materials/${requested}?${context}`)
    }
    return workspace({ materialId: sources[0]?.id ?? null, sources })
  }

  if (!uuid.test(id)) notFound()
  const detail = await getStudySetDetail(user.id, id)
  const studySet = detail?.studySet
  if (!studySet || studySet.type !== "exam") notFound()
  const settings = detail?.version?.settings
  const config =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings
      : {}
  const attemptId =
    typeof query.attempt === "string" && uuid.test(query.attempt)
      ? query.attempt
      : undefined
  if (studySet.materialId && (await getMaterial(studySet.materialId))) {
    const context = new URLSearchParams({ exam: id })
    if (attemptId) context.set("attempt", attemptId)
    redirect(`/materials/${studySet.materialId}?${context}`)
  }
  return workspace({
    initialStudySet: studySet,
    materialId: studySet.materialId,
    initialAttemptId: attemptId,
    initialDurationMinutes:
      typeof config.durationMinutes === "number"
        ? config.durationMinutes
        : null,
    initialCount: typeof config.count === "number" ? config.count : undefined,
  })
}
