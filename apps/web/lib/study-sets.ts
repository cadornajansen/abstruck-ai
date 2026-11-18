import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Json, Tables } from "@/lib/supabase/database.types"
import { signRead } from "@/lib/storage/r2"
import type {
  StudyOutputType,
  StudyOutputArtifact,
} from "@/lib/study-output-types"
import {
  validateOutput,
  verifyOutputCitations,
  OutputError,
  type OutputType,
} from "../../worker/src/study-output"

export interface StudySet {
  id: string
  materialId: string | null
  sourceUnavailable?: boolean
  type: "notes" | "summary" | "flashcards" | "quiz" | "exam" | StudyOutputType
  title: string
  status: "draft" | "queued" | "generating" | "ready" | "failed"
  errorCode: string | null
  content: string
  revision: number
  updatedAt: string
}

export interface StudySetDetail {
  artifact?: StudyOutputArtifact
  studySet: StudySet
  version: { id: string; version: number; content: Json; settings: Json } | null
  items: {
    id: string
    logicalId: string
    position: number
    kind: string
    prompt: Json
    answer: Json
    rubric: Json
    citations: Json
    review: { starred: boolean; due_at: string | null }
  }[]
}

type NoteSaveResult =
  | { kind: "saved" | "conflict"; studySet: StudySet }
  | { kind: "not_found" }
  | { kind: "not_notes" }

function toStudySet(
  row: Tables<"study_sets"> & { error_code?: string | null }
): StudySet {
  const draft = row.draft_content
  const markdown =
    draft && typeof draft === "object" && !Array.isArray(draft)
      ? draft.markdown
      : undefined
  return {
    id: row.id,
    materialId: row.material_id,
    sourceUnavailable: row.source_unavailable,
    type: row.type as StudySet["type"],
    title: row.title,
    status: row.status as StudySet["status"],
    errorCode: row.error_code ?? null,
    content: typeof markdown === "string" ? markdown : "",
    revision: row.draft_revision,
    updatedAt: row.updated_at,
  }
}

export async function getMaterialStudySets(
  ownerId: string,
  materialId: string
): Promise<StudySet[]> {
  const db = await createClient()
  const { data, error } = await db
    .from("study_sets")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("material_id", materialId)
    .order("updated_at", { ascending: false })
  if (error) throw new Error("Your study sets could not be loaded.")
  return data.map(toStudySet)
}

export async function getPreservedStudySets(
  ownerId: string
): Promise<StudySet[]> {
  const db = await createClient()
  const { data, error } = await db
    .from("study_sets")
    .select("*")
    .eq("owner_id", ownerId)
    .is("material_id", null)
    .order("updated_at", { ascending: false })
  if (error) throw new Error("Your saved study sets could not be loaded.")
  return data.map(toStudySet)
}

export async function getStudySet(
  ownerId: string,
  id: string
): Promise<StudySet | null> {
  const db = await createClient()
  const { data, error } = await db
    .from("study_sets")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error("This study set could not be loaded.")
  return data ? toStudySet(data) : null
}

export async function getStudySetDetail(
  ownerId: string,
  id: string
): Promise<StudySetDetail | null> {
  const studySet = await getStudySet(ownerId, id)
  if (!studySet) return null
  const db = await createClient()
  const { data: version, error } = await db
    .from("study_set_versions")
    .select("id,version,content,settings")
    .eq("owner_id", ownerId)
    .eq("study_set_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error("This saved version could not be loaded.")
  if (!version) return { studySet, version: null, items: [] }
  const { data: items, error: itemsError } = await db
    .from("study_items")
    .select("id,logical_id,position,kind,prompt,answer,rubric,citations")
    .eq("owner_id", ownerId)
    .eq("version_id", version.id)
    .eq("kind", "flashcard")
    .order("position")
  if (itemsError) throw new Error("Your flashcards could not be loaded.")
  const { data: reviewStates, error: reviewError } = items.length
    ? await db
        .from("flashcard_review_state")
        .select("study_item_id,starred,due_at")
        .eq("owner_id", ownerId)
        .in(
          "study_item_id",
          items.map((item) => item.id)
        )
    : { data: [], error: null }
  if (reviewError) throw new Error("Your review progress could not be loaded.")
  const reviews = new Map(
    reviewStates?.map((state) => [state.study_item_id, state])
  )
  let artifact: StudyOutputArtifact | undefined
  if (studySet.type === "podcast" || studySet.type === "video") {
    const { data: asset, error: assetError } = await db
      .from("assets")
      .select("object_key,mime,bytes,metadata")
      .eq("study_set_id", studySet.id)
      .eq("role", studySet.type === "podcast" ? "study_audio" : "study_video")
      .not("uploaded_at", "is", null)
      .maybeSingle()
    if (assetError) throw new Error("This saved media could not be loaded.")
    if (asset) {
      const metadata = asset.metadata as { durationMs?: number } | null
      artifact = {
        url: await signRead(asset.object_key, asset.mime),
        mime: asset.mime as StudyOutputArtifact["mime"],
        bytes: asset.bytes,
        durationMs: metadata?.durationMs ?? 0,
      }
    }
  }
  return {
    studySet,
    version,
    ...(artifact ? { artifact } : {}),
    items: items.map(({ logical_id, ...item }) => ({
      ...item,
      logicalId: logical_id,
      review: {
        starred: reviews.get(item.id)?.starred ?? false,
        due_at: reviews.get(item.id)?.due_at ?? null,
      },
    })),
  }
}

export async function createManualNotes(
  ownerId: string,
  material: Pick<Tables<"materials">, "id" | "space_id">,
  title: string,
  content: string
): Promise<StudySet> {
  const db = createAdminClient()
  const { data, error } = await db
    .from("study_sets")
    .insert({
      owner_id: ownerId,
      material_id: material.id,
      space_id: material.space_id,
      type: "notes",
      title,
      status: "draft",
      draft_content: { markdown: content },
    })
    .select("*")
    .single()
  if (error) throw new Error("Your note could not be created.")
  return toStudySet(data)
}

export async function saveManualNotes(
  ownerId: string,
  id: string,
  title: string,
  content: string,
  revision: number
): Promise<NoteSaveResult> {
  const current = await getStudySet(ownerId, id)
  if (!current) return { kind: "not_found" }
  if (current.type !== "notes") return { kind: "not_notes" }
  const db = createAdminClient()
  // Matching the revision in the UPDATE makes concurrent saves atomic.
  const { data, error } = await db
    .from("study_sets")
    .update({
      title,
      draft_content: { markdown: content },
      draft_revision: revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("type", "notes")
    .eq("draft_revision", revision)
    .select("*")
    .maybeSingle()
  if (error) throw new Error("Your note could not be saved.")
  if (data) return { kind: "saved", studySet: toStudySet(data) }
  const latest = await getStudySet(ownerId, id)
  return latest ? { kind: "conflict", studySet: latest } : { kind: "not_found" }
}

export async function saveStudyOutput(
  ownerId: string,
  id: string,
  versionId: string,
  revision: number,
  content: Record<string, unknown>
): Promise<
  | { kind: "saved" | "conflict"; detail: StudySetDetail }
  | { kind: "not_found" | "unsupported" | "invalid" }
> {
  const detail = await getStudySetDetail(ownerId, id)
  if (!detail?.version) return { kind: "not_found" }
  if (
    ![
      "interactive",
      "mind-map",
      "flowchart",
      "timeline",
      "bar-chart",
      "line-chart",
    ].includes(detail.studySet.type)
  )
    return { kind: "unsupported" }
  if (detail.version.id !== versionId || detail.studySet.revision !== revision)
    return { kind: "conflict", detail }
  const db = createAdminClient()
  const { data: job, error: jobError } = await db
    .from("processing_jobs")
    .select("input")
    .eq("study_set_id", id)
    .eq("owner_id", ownerId)
    .maybeSingle()
  if (jobError || !job)
    throw new Error("This output's saved basis could not be loaded.")
  const input = job.input as {
    inputKind?: string
    conversation?: { messages: { role: string; text: string }[] }
    sources: { id: string; version: number }[]
    settings: { count: number }
  }
  const sources: {
    id: string
    material_id: string
    ordinal: number
    text: string
  }[] = []
  for (const source of input.sources) {
    const { data, error } = await db
      .from("source_segments")
      .select("id,material_id,ordinal,text")
      .eq("owner_id", ownerId)
      .eq("material_id", source.id)
      .eq("extraction_version", source.version)
    if (error) throw new Error("The source evidence could not be loaded.")
    sources.push(...data)
  }
  const conversation = input.inputKind === "conversation"
  const evidence = conversation
    ? (input.conversation?.messages ?? [])
        .filter((message) => message.role === "user")
        .map((message) => message.text)
        .join("\n")
    : sources.map((source) => source.text).join("\n")
  let validated: Record<string, unknown>
  try {
    if (
      content.kind !== detail.studySet.type ||
      content.inputKind !== input.inputKind
    )
      return { kind: "invalid" }
    validated = validateOutput(
      { ...content, status: "ready" },
      detail.studySet.type as OutputType,
      input.settings.count,
      {
        inputKind: conversation ? "conversation" : "sources",
        evidence,
        citations: (value) => verifyOutputCitations(value, sources),
      }
    )
  } catch (error) {
    if (error instanceof OutputError) return { kind: "invalid" }
    throw error
  }
  const saved = await db.rpc("save_study_output", {
    p_owner_id: ownerId,
    p_study_set_id: id,
    p_version_id: versionId,
    p_revision: revision,
    p_content: validated as Json,
  })
  if (saved.error) return { kind: "invalid" }
  const result = saved.data as { status: string }
  if (result.status === "not_found" || result.status === "unsupported")
    return { kind: result.status }
  const latest = await getStudySetDetail(ownerId, id)
  if (!latest) return { kind: "not_found" }
  return {
    kind: result.status === "saved" ? "saved" : "conflict",
    detail: latest,
  }
}
