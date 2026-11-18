import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    !("page" in body) ||
    !("activeTab" in body) ||
    !("version" in body)
  )
    return NextResponse.json(
      { error: "Invalid reading position." },
      { status: 400 }
    )
  const { page, activeTab, version } = body
  if (
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !["chat", "learn"].includes(String(activeTab))
  )
    return NextResponse.json(
      { error: "Invalid reading position." },
      { status: 400 }
    )
  const db = await createClient()
  const { data: material } = await db
    .from("materials")
    .select("extraction_version,source_type")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()
  if (!material)
    return NextResponse.json(
      { error: "Material unavailable." },
      { status: 404 }
    )
  if (version !== material.extraction_version)
    return NextResponse.json(
      { error: "This material changed. Refresh before saving your position." },
      { status: 409 }
    )
  const media = ["audio", "video", "youtube"].includes(material.source_type)
  const timeMs = "timeMs" in body ? body.timeMs : undefined
  if (
    (!media && page > 200) ||
    (timeMs !== undefined &&
      (!media ||
        typeof timeMs !== "number" ||
        !Number.isInteger(timeMs) ||
        timeMs < 0 ||
        timeMs > 3_600_000))
  )
    return NextResponse.json(
      { error: "Invalid reading position." },
      { status: 400 }
    )
  const { error } = await db.from("material_reading_state").upsert(
    {
      owner_id: user.id,
      material_id: id,
      extraction_version: material.extraction_version,
      locator: media
        ? {
            type: "time",
            time_ms: typeof timeMs === "number" ? timeMs : 0,
            page,
          }
        : material.source_type === "text"
          ? { type: "paragraph", page, paragraph: page }
          : { type: "page", page },
      active_tab: String(activeTab),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,material_id" }
  )
  return error
    ? NextResponse.json(
        { error: "Your reading position could not be saved." },
        { status: 500 }
      )
    : NextResponse.json({ saved: true })
}
