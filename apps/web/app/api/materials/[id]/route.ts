import { getCurrentUser } from "@/lib/auth/session"
import { requestMaterialDeletion } from "@/lib/account-data"
import { getMaterial } from "@/lib/materials"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { signRead } from "@/lib/storage/r2"
import { revalidatePath } from "next/cache"

export const runtime = "nodejs"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return requestMaterialDeletion(request, (await params).id)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to rename your material." },
      { status: 401 }
    )
  const { id } = await params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return Response.json({ error: "Material not found." }, { status: 404 })
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Use a JSON request." }, { status: 415 })
  let body: unknown
  try {
    const input = await request.text()
    if (input.length > 2_000)
      return Response.json(
        { error: "The material name is too long." },
        { status: 413 }
      )
    body = JSON.parse(input)
  } catch {
    return Response.json(
      { error: "Enter a material name and try again." },
      { status: 400 }
    )
  }
  const title =
    body &&
    typeof body === "object" &&
    "title" in body &&
    typeof body.title === "string"
      ? body.title.trim()
      : ""
  if (!title || title.length > 240 || /[\u0000-\u001f\u007f]/.test(title))
    return Response.json(
      { error: "Use a name of 1–240 characters on one line." },
      { status: 400 }
    )
  const material = await getMaterial(id)
  if (!material)
    return Response.json({ error: "Material not found." }, { status: 404 })
  if (!["ready", "partial", "failed"].includes(material.status))
    return Response.json(
      {
        error: "This material is still processing. Rename it when it is ready.",
      },
      { status: 409 }
    )
  const db = createAdminClient()
  const { data, error } = await db
    .from("materials")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("status", material.status)
    .select("id,title")
    .maybeSingle()
  if (error)
    return Response.json(
      { error: "Your material name could not be saved. Try again." },
      { status: 503 }
    )
  if (!data)
    return Response.json(
      {
        error:
          "This material changed while you were renaming it. Refresh and try again.",
      },
      { status: 409 }
    )
  revalidatePath("/", "layout")
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const material = await getMaterial(id)
  if (!material)
    return Response.json({ error: "Material not found." }, { status: 404 })
  const db = await createClient()
  const [{ data: asset }, { data: segments, error }] = await Promise.all([
    db
      .from("assets")
      .select("object_key,uploaded_at,mime")
      .eq("material_id", id)
      .eq(
        "role",
        ["docx", "pptx"].includes(material.source_type)
          ? "normalized_pdf"
          : "original"
      )
      .maybeSingle(),
    db
      .from("source_segments")
      .select(
        "id,ordinal,text,locator,extraction_method,extraction_status,unreadable_regions"
      )
      .eq("material_id", id)
      .eq("extraction_version", material.extraction_version)
      .order("ordinal"),
  ])
  if (error)
    return Response.json(
      { error: "Material could not be loaded." },
      { status: 503 }
    )
  let fileUrl: string | undefined
  if (
    asset?.uploaded_at &&
    ["pdf", "docx", "pptx"].includes(material.source_type)
  ) {
    try {
      fileUrl = await signRead(asset.object_key)
    } catch {
      /* Extracted text remains available when file storage is unavailable. */
    }
  }
  let media:
    | {
        kind: "audio" | "video"
        url: string
        mime: string
        durationMs: number
        audioUrl?: string
        youtubeId?: string
        chapters?: {
          startMs: number
          endMs: number
          title: string
          summary: string
        }[]
        chaptersStatus: "ready" | "unavailable"
        segments: {
          id: string
          ordinal: number
          text: string
          startMs: number
          endMs: number
          speaker: string | null
        }[]
      }
    | undefined
  if (["audio", "video", "youtube"].includes(material.source_type)) {
    const [{ data: run }, { data: audio }] = await Promise.all([
      db
        .from("transcription_runs")
        .select("duration_ms,output")
        .eq("material_id", id)
        .maybeSingle(),
      db
        .from("assets")
        .select("object_key,uploaded_at")
        .eq("material_id", id)
        .eq("role", "normalized_audio")
        .maybeSingle(),
    ])
    if (run && audio?.uploaded_at) {
      const audioUrl = await signRead(audio.object_key, "audio/mpeg")
      const youtube = material.source_type === "youtube"
      const video = material.source_type === "video" || youtube
      const output =
        run.output &&
        typeof run.output === "object" &&
        !Array.isArray(run.output)
          ? run.output
          : null
      const chapters = Array.isArray(output?.chapters)
        ? output.chapters
            .filter(
              (chapter) =>
                chapter &&
                typeof chapter === "object" &&
                !Array.isArray(chapter) &&
                typeof chapter.startMs === "number" &&
                typeof chapter.endMs === "number" &&
                typeof chapter.title === "string" &&
                typeof chapter.summary === "string"
            )
            .map(
              (chapter) =>
                chapter as {
                  startMs: number
                  endMs: number
                  title: string
                  summary: string
                }
            )
        : undefined
      media = {
        kind: video ? "video" : "audio",
        url: youtube
          ? material.source_url!
          : video && asset?.uploaded_at
            ? await signRead(asset.object_key, asset.mime)
            : audioUrl,
        mime: youtube
          ? "video/youtube"
          : video
            ? (asset?.mime ?? "video/mp4")
            : "audio/mpeg",
        durationMs: run.duration_ms,
        ...(video ? { audioUrl } : {}),
        ...(youtube ? { youtubeId: material.youtube_id! } : {}),
        ...(chapters?.length ? { chapters } : {}),
        chaptersStatus: chapters?.length ? "ready" : "unavailable",
        segments: (segments ?? [])
          .filter(
            (s) =>
              s.locator &&
              typeof s.locator === "object" &&
              !Array.isArray(s.locator) &&
              s.locator.type === "time"
          )
          .map((s) => {
            const locator = s.locator as {
              start_ms: number
              end_ms: number
              speaker?: string
            }
            return {
              id: s.id,
              ordinal: s.ordinal,
              text: s.text,
              startMs: locator.start_ms,
              endMs: locator.end_ms,
              speaker: locator.speaker ?? null,
            }
          }),
      }
    }
  }
  return Response.json(
    {
      material,
      pages: (segments ?? []).map((s) => ({
        pageNumber: s.ordinal,
        text: s.text,
        locator: s.locator,
        extractionMethod: s.extraction_method,
        extractionStatus: s.extraction_status,
        unreadableRegions: s.unreadable_regions,
      })),
      fileUrl,
      media,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
