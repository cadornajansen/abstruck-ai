import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
const headers = { "Cache-Control": "private, no-store" }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers }
    )
  const { id } = await params
  const attemptId = new URL(request.url).searchParams.get("attemptId")
  if (!uuid.test(id) || (attemptId !== null && !uuid.test(attemptId)))
    return Response.json(
      { error: "Choose a valid review." },
      { status: 400, headers }
    )

  try {
    const db = await createClient()
    const { data: deck, error: deckError } = await db
      .from("study_sets")
      .select("id")
      .eq("owner_id", user.id)
      .eq("id", id)
      .eq("type", "flashcards")
      .maybeSingle()
    if (deckError) throw deckError
    if (!deck)
      return Response.json(
        { error: "Deck not found." },
        { status: 404, headers }
      )

    // Read-only recovery must not create an attempt or advance a schedule.
    const { data: attempts, error } = await db
      .from("attempts")
      .select("id,mode")
      .eq("owner_id", user.id)
      .eq("study_set_id", id)
      .eq("state", "active")
    if (error) throw error
    let requested = attempts.find((attempt) => attempt.id === attemptId)
    if (attemptId && !requested) {
      const result = await db
        .from("attempts")
        .select("id,mode")
        .eq("owner_id", user.id)
        .eq("study_set_id", id)
        .eq("id", attemptId)
        .maybeSingle()
      if (result.error) throw result.error
      requested = result.data ?? undefined
      if (!requested)
        return Response.json(
          { error: "Review not found." },
          { status: 404, headers }
        )
    }
    const rows =
      requested && !attempts.some((row) => row.id === requested.id)
        ? [...attempts, requested]
        : attempts
    const admin = createAdminClient()
    const payloads = await Promise.all(
      rows.map(async (attempt) => {
        const result = await admin.rpc("flashcard_attempt_payload", {
          p_owner_id: user.id,
          p_attempt_id: attempt.id,
        })
        if (result.error || !result.data)
          throw result.error ?? new Error("Review unavailable")
        return [attempt.id, result.data] as const
      })
    )
    const saved = new Map(payloads)
    const active = Object.fromEntries(
      ["spaced", "fast"].map((mode) => [
        mode,
        saved.get(
          attempts.find((attempt) => attempt.mode === mode)?.id ?? ""
        ) ?? null,
      ])
    )
    return Response.json(
      {
        active,
        session: requested ? saved.get(requested.id) : null,
        serverTime: new Date().toISOString(),
      },
      { headers }
    )
  } catch {
    return Response.json(
      { error: "Your saved review could not be loaded. Please try again." },
      { status: 503, headers }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to continue." },
      { status: 401, headers }
    )
  const { id } = await params
  const body: unknown = await request.json().catch(() => null)
  if (
    !uuid.test(id) ||
    !body ||
    typeof body !== "object" ||
    !("requestId" in body) ||
    typeof body.requestId !== "string" ||
    !uuid.test(body.requestId)
  ) {
    return Response.json(
      { error: "Include a valid review request ID." },
      { status: 400, headers }
    )
  }
  const db = createAdminClient()
  const starting = "action" in body && body.action === "start"
  if (
    starting &&
    (!("mode" in body) || (body.mode !== "fast" && body.mode !== "spaced"))
  ) {
    return Response.json(
      { error: "Choose fast or spaced review." },
      { status: 400, headers }
    )
  }
  if (
    !starting &&
    (("action" in body && body.action !== "rate") ||
      !("attemptId" in body) ||
      typeof body.attemptId !== "string" ||
      !uuid.test(body.attemptId) ||
      !("cardId" in body) ||
      typeof body.cardId !== "string" ||
      !uuid.test(body.cardId) ||
      !("rating" in body) ||
      (body.rating !== "again" && body.rating !== "got_it"))
  ) {
    return Response.json(
      { error: "Include the review session, card, and rating." },
      { status: 400, headers }
    )
  }
  try {
    // The RPC locks the session and records the request ID in the same transaction as its schedule change.
    const result = starting
      ? await db.rpc("start_flashcard_review", {
          p_owner_id: user.id,
          p_study_set_id: id,
          p_mode: "mode" in body ? String(body.mode) : "",
          p_request_id: body.requestId,
        })
      : await db.rpc("rate_flashcard", {
          p_owner_id: user.id,
          p_study_set_id: id,
          p_attempt_id: (body as { attemptId: string }).attemptId,
          p_card_id: (body as { cardId: string }).cardId,
          p_rating: (body as { rating: string }).rating,
          p_request_id: body.requestId,
        })
    if (result.error || !result.data) throw new Error("Review failed")
    if (
      typeof result.data === "object" &&
      !Array.isArray(result.data) &&
      "error" in result.data
    ) {
      const code = result.data.error
      const status =
        code === "not_found"
          ? 404
          : code === "request_conflict" || code === "not_ready"
            ? 409
            : 400
      const error =
        code === "not_found"
          ? "Review not found."
          : code === "request_conflict"
            ? "This card was already rated. Resume the review to load your saved progress."
            : code === "not_ready"
              ? "Your flashcards are not ready yet."
              : "This card does not belong to the active review."
      return Response.json({ error }, { status, headers })
    }
    return Response.json(result.data, { headers })
  } catch {
    return Response.json(
      { error: "Your review could not be saved. Please try again." },
      { status: 503, headers }
    )
  }
}
