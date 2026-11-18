import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

async function readJson(
  body: ReadableStream<Uint8Array>,
  limit: number
): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  const reader = body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) {
        await reader.cancel()
        throw new Error("callback_body_limit")
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET
  const key = process.env.ASSEMBLYAI_API_KEY
  if (!secret || !key)
    return Response.json({ error: "Callback unavailable." }, { status: 503 })
  const token = request.headers.get("x-assemblyai-webhook-secret") ?? ""
  const [jobId = "", signature = ""] = token.split(".")
  if (
    !uuid.test(jobId) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    token.split(".").length !== 2
  )
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  const expected = createHmac("sha256", secret).update(jobId).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  try {
    if (!request.body)
      return Response.json({ error: "Invalid callback." }, { status: 400 })
    const payload = await readJson(request.body, 8192)
    if (
      !record(payload) ||
      typeof payload.transcript_id !== "string" ||
      !uuid.test(payload.transcript_id) ||
      !["completed", "error"].includes(payload.status as string)
    )
      return Response.json({ error: "Invalid callback." }, { status: 400 })
    const db = createAdminClient()
    const { data: run, error } = await db
      .from("transcription_runs")
      .select("provider_audio_url,provider_id,submitted_at")
      .eq("job_id", jobId)
      .abortSignal(AbortSignal.timeout(1500))
      .maybeSingle()
    if (error)
      return Response.json(
        { error: "Callback could not be saved." },
        { status: 503 }
      )
    if (
      !run?.submitted_at ||
      !run.provider_audio_url ||
      (run.provider_id && run.provider_id !== payload.transcript_id)
    )
      return Response.json(
        { error: "Callback source did not match." },
        { status: 409 }
      )
    const response = await fetch(
      `https://api.assemblyai.com/v2/transcript/${payload.transcript_id}`,
      {
        headers: { Authorization: key },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!response.ok || !response.body)
      return Response.json(
        { error: "Callback could not be verified." },
        { status: 503 }
      )
    const transcript = await readJson(response.body, 8_388_608)
    if (
      !record(transcript) ||
      transcript.id !== payload.transcript_id ||
      transcript.status !== payload.status ||
      typeof transcript.audio_url !== "string" ||
      createHash("sha256").update(transcript.audio_url).digest("hex") !==
        createHash("sha256").update(run.provider_audio_url).digest("hex")
    )
      return Response.json(
        { error: "Callback source did not match." },
        { status: 409 }
      )
    const saved = await db
      .rpc("record_media_callback", {
        p_job_id: jobId,
        p_provider_id: payload.transcript_id,
        p_status: payload.status as string,
        p_audio_url: transcript.audio_url,
      })
      .abortSignal(AbortSignal.timeout(1500))
    if (saved.error)
      return Response.json(
        { error: "Callback could not be saved." },
        { status: 503 }
      )
    if (!saved.data)
      return Response.json(
        { error: "Callback source did not match." },
        { status: 409 }
      )
    return Response.json({ received: true })
  } catch {
    return Response.json(
      { error: "Callback could not be verified." },
      { status: 503 }
    )
  }
}
