import "server-only"

import { Buffer } from "node:buffer"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, Tables } from "@/lib/supabase/database.types"
import {
  annotationColors,
  annotationLimits,
  type AnnotationColor,
  type CreateMaterialAnnotationInput,
  type DeleteMaterialAnnotationInput,
  type EditMaterialAnnotationInput,
  type MaterialAnnotation,
  type MaterialAnnotationList,
  type MaterialAnnotationResult,
  type MaterialAnnotationDeletion,
  type PdfHighlightRectangle,
  type AnnotationLocator,
} from "@/lib/annotation-types"

export const annotationHeaders = { "Cache-Control": "private, no-store" }
export const annotationUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const columns =
  "id,material_id,extraction_version,locator,body,color,revision,created_at,updated_at"
type AnnotationRow = Pick<
  Tables<"material_annotations">,
  | "id"
  | "material_id"
  | "extraction_version"
  | "locator"
  | "body"
  | "color"
  | "revision"
  | "created_at"
  | "updated_at"
>

function annotationDto(
  row: AnnotationRow
): MaterialAnnotation<AnnotationLocator> {
  return {
    id: row.id,
    materialId: row.material_id,
    extractionVersion: row.extraction_version,
    locator: row.locator as unknown as AnnotationLocator,
    body: row.body,
    color: row.color as AnnotationColor,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class AnnotationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly annotation?: MaterialAnnotation<AnnotationLocator>,
    readonly currentExtractionVersion?: number
  ) {
    super(message)
  }
}

function invalid(): never {
  throw new AnnotationError(
    400,
    "invalid",
    "Choose text on one document page or a transcript passage and check the annotation details."
  )
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
function integer(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value < 2147483647
  )
}
function annotationBody(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > annotationLimits.body ||
    value.includes("\u0000")
  )
    invalid()
  return value
}
function annotationColor(value: unknown): AnnotationColor {
  if (
    typeof value !== "string" ||
    !annotationColors.some((color) => color === value)
  )
    invalid()
  return value as AnnotationColor
}
function rectangle(value: unknown): PdfHighlightRectangle {
  if (!object(value)) invalid()
  const { x, y, width, height } = value
  if (
    ![x, y, width, height].every(
      (coordinate) =>
        typeof coordinate === "number" && Number.isFinite(coordinate)
    )
  )
    invalid()
  const rect = value as unknown as PdfHighlightRectangle
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x > 1 ||
    rect.y > 1 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.x + rect.width > 1.000001 ||
    rect.y + rect.height > 1.000001
  )
    invalid()
  const round = (number: number) => Math.round(number * 1_000_000) / 1_000_000
  const normalized = { x: round(rect.x), y: round(rect.y), width: 0, height: 0 }
  normalized.width = Math.min(round(rect.width), 1 - normalized.x)
  normalized.height = Math.min(round(rect.height), 1 - normalized.y)
  if (normalized.width <= 0 || normalized.height <= 0) invalid()
  return normalized
}
function locator(value: unknown): AnnotationLocator {
  if (object(value) && value.type === "time") {
    if (
      typeof value.segmentId !== "string" ||
      !annotationUuid.test(value.segmentId) ||
      !integer(value.startMs, 0) ||
      !integer(value.endMs, 1) ||
      value.endMs <= value.startMs ||
      typeof value.quote !== "string" ||
      !value.quote.trim() ||
      value.quote.length > annotationLimits.quote ||
      value.quote.includes("\u0000")
    )
      invalid()
    return {
      type: "time",
      segmentId: value.segmentId,
      startMs: value.startMs,
      endMs: value.endMs,
      quote: value.quote.trim(),
    }
  }
  if (
    !object(value) ||
    value.type !== "page" ||
    !integer(value.page, 1) ||
    !Array.isArray(value.rects) ||
    value.rects.length < 1 ||
    value.rects.length > annotationLimits.rectangles ||
    typeof value.quote !== "string" ||
    !value.quote.trim() ||
    value.quote.length > annotationLimits.quote ||
    value.quote.includes("\u0000")
  )
    invalid()
  return {
    type: "page",
    page: value.page,
    rects: value.rects.map(rectangle),
    quote: value.quote.trim(),
  }
}

export function annotationCreation(
  body: Record<string, unknown>
): Required<CreateMaterialAnnotationInput> {
  if (
    typeof body.id !== "string" ||
    !annotationUuid.test(body.id) ||
    !integer(body.extractionVersion, 1)
  )
    invalid()
  return {
    id: body.id,
    extractionVersion: body.extractionVersion,
    locator: locator(body.locator),
    body: annotationBody(body.body ?? ""),
    color: annotationColor(body.color ?? "yellow"),
  }
}
export function annotationDeletion(
  body: Record<string, unknown>
): DeleteMaterialAnnotationInput {
  if (!integer(body.extractionVersion, 1) || !integer(body.revision, 0))
    invalid()
  return { extractionVersion: body.extractionVersion, revision: body.revision }
}
export function annotationEdit(
  body: Record<string, unknown>
): EditMaterialAnnotationInput {
  if ("locator" in body || "materialId" in body || "id" in body) invalid()
  return {
    ...annotationDeletion(body),
    body: annotationBody(body.body),
    color: annotationColor(body.color),
  }
}

export async function annotationInput(
  request: Request
): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    invalid()
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 64_000) {
        await reader.cancel()
        throw new AnnotationError(
          413,
          "input_limit",
          "Keep the highlight and note to 4,000 characters each."
        )
      }
      chunks.push(next.value)
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!object(input)) invalid()
    return input
  } finally {
    reader.releaseLock()
  }
}

export async function listMaterialAnnotations(
  ownerId: string,
  materialId: string
): Promise<MaterialAnnotationList<AnnotationLocator>> {
  const db = await createClient()
  const { data: material, error: materialError } = await db
    .from("materials")
    .select("id,extraction_version,source_type")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle()
  if (materialError) throw new Error("material_unavailable")
  if (!material)
    throw new AnnotationError(404, "not_found", "Material not found.")
  if (
    !["pdf", "docx", "pptx", "audio", "video", "youtube"].includes(
      material.source_type
    )
  )
    throw new AnnotationError(
      400,
      "unsupported_source",
      "Annotations are available on document pages and media transcripts."
    )
  const { data, error } = await db
    .from("material_annotations")
    .select(columns)
    .eq("owner_id", ownerId)
    .eq("material_id", materialId)
    .order("created_at")
    .limit(annotationLimits.perMaterial)
  if (error) throw new Error("annotations_unavailable")
  return {
    annotations: data.map(annotationDto),
    currentExtractionVersion: material.extraction_version,
  }
}

interface Reply {
  status: string
  annotation?: AnnotationRow | null
  currentExtractionVersion?: number
}
function checked(result: {
  data: Json
  error: { message: string } | null
}): Reply {
  if (result.error || !object(result.data))
    throw new Error("annotation_unavailable")
  const reply = result.data as unknown as Reply
  if (reply.status === "ok") return reply
  const current = reply.annotation ? annotationDto(reply.annotation) : undefined
  const message =
    reply.status === "not_found"
      ? "This material or highlight is no longer available."
      : reply.status === "source_changed"
        ? "This source version changed. Refresh before creating or editing highlights."
        : reply.status === "conflict"
          ? "This highlight changed in another tab. Keep your draft and load the latest version."
          : reply.status === "request_conflict"
            ? "This save request already belongs to a different highlight."
            : reply.status === "source_unavailable"
              ? "This source is not ready for annotations. Finish or retry processing, then try again."
              : reply.status === "annotation_limit"
                ? "This material has 500 highlights. Remove one before adding another."
                : reply.status === "invalid_page"
                  ? "This page is unavailable in the selected source version."
                  : reply.status === "invalid_time"
                    ? "This transcript passage or timestamp does not match the selected source version. Refresh the source and choose the passage again."
                    : "Check the highlight selection and note."
  const status =
    reply.status === "not_found"
      ? 404
      : reply.status === "annotation_limit"
        ? 429
        : ["invalid", "invalid_page", "invalid_time"].includes(reply.status)
          ? 400
          : 409
  throw new AnnotationError(
    status,
    reply.status,
    message,
    current,
    reply.currentExtractionVersion
  )
}

export async function createMaterialAnnotation(
  ownerId: string,
  materialId: string,
  input: Required<CreateMaterialAnnotationInput>
): Promise<MaterialAnnotationResult<AnnotationLocator>> {
  const reply = checked(
    await createAdminClient().rpc("create_material_annotation", {
      p_owner_id: ownerId,
      p_material_id: materialId,
      p_annotation_id: input.id,
      p_extraction_version: input.extractionVersion,
      p_locator: input.locator as unknown as Json,
      p_body: input.body,
      p_color: input.color,
    })
  )
  return {
    annotation: annotationDto(reply.annotation!),
    currentExtractionVersion: reply.currentExtractionVersion!,
  }
}
export async function editMaterialAnnotation(
  ownerId: string,
  materialId: string,
  id: string,
  input: EditMaterialAnnotationInput
): Promise<MaterialAnnotationResult<AnnotationLocator>> {
  const reply = checked(
    await createAdminClient().rpc("edit_material_annotation", {
      p_owner_id: ownerId,
      p_material_id: materialId,
      p_annotation_id: id,
      p_extraction_version: input.extractionVersion,
      p_revision: input.revision,
      p_body: input.body,
      p_color: input.color,
    })
  )
  return {
    annotation: annotationDto(reply.annotation!),
    currentExtractionVersion: reply.currentExtractionVersion!,
  }
}
export async function deleteMaterialAnnotation(
  ownerId: string,
  materialId: string,
  id: string,
  input: DeleteMaterialAnnotationInput
): Promise<MaterialAnnotationDeletion> {
  const reply = checked(
    await createAdminClient().rpc("delete_material_annotation", {
      p_owner_id: ownerId,
      p_material_id: materialId,
      p_annotation_id: id,
      p_extraction_version: input.extractionVersion,
      p_revision: input.revision,
    })
  )
  return {
    deleted: true,
    currentExtractionVersion: reply.currentExtractionVersion!,
  }
}

export function annotationFailure(error: unknown): Response {
  if (error instanceof AnnotationError)
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.annotation ? { annotation: error.annotation } : {}),
        ...(error.currentExtractionVersion
          ? { currentExtractionVersion: error.currentExtractionVersion }
          : {}),
      },
      { status: error.status, headers: annotationHeaders }
    )
  return Response.json(
    {
      error:
        error instanceof SyntaxError
          ? "The highlight request is invalid."
          : "Your highlights could not be saved or loaded. Keep your note and try again.",
    },
    {
      status: error instanceof SyntaxError ? 400 : 503,
      headers: annotationHeaders,
    }
  )
}
