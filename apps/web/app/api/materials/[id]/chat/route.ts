import { getCurrentUser } from "@/lib/auth/session"
import { getMaterial } from "@/lib/materials"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMaterialChat } from "@/lib/study-chat"
import {
  AnswerError,
  groundedAnswer,
  prepareGroundedAnswer,
  type PreparedAnswer,
  type SourcePassage,
} from "@/lib/openai/grounded-answer"
import {
  parseChatPreferences,
  type ChatPreferences,
} from "@/lib/chat-preferences"
import { getAvailableChatModels } from "@/lib/openai/chat-models"
import {
  retrieveSourcePassages,
  embedRetrievalQuery,
  semanticRetrievalEnabled,
  QUERY_EMBEDDING_MAX_COST_USD,
} from "@/lib/source-retrieval"
import {
  prepareWebSearch,
  searchWeb,
  WebSearchError,
  type PreparedSearch,
  type SearchUsage,
} from "@/lib/openai/web-search"

export const runtime = "nodejs"
export const maxDuration = 60
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const privateHeaders = { "Cache-Control": "private, no-store" }
type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  if (!(await getCurrentUser()))
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  if (!(await getMaterial(id)))
    return Response.json({ error: "Material not found." }, { status: 404 })
  const conversationId = new URL(request.url).searchParams.get("conversationId")
  if (conversationId && !uuid.test(conversationId))
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  try {
    return Response.json(await getMaterialChat(id, conversationId), {
      headers: privateHeaders,
    })
  } catch {
    return Response.json(
      { error: "Your conversation could not be loaded." },
      { status: 404 }
    )
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  let body: { requestId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 })
  }
  if (!body.requestId || !uuid.test(body.requestId))
    return Response.json({ error: "Invalid request." }, { status: 400 })
  const { data, error } = await createAdminClient().rpc("stop_chat_request", {
    p_owner_id: user.id,
    p_material_id: id,
    p_request_id: body.requestId,
  })
  if (error || !data)
    return Response.json(
      {
        error: "This reply could not be stopped. Refresh to check its status.",
      },
      { status: 409 }
    )
  return Response.json({ stopped: true }, { headers: privateHeaders })
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  if (!(await getMaterial(id)))
    return Response.json({ error: "Material not found." }, { status: 404 })
  const body: unknown = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== "object" ||
    !("conversationId" in body) ||
    typeof body.conversationId !== "string" ||
    !uuid.test(body.conversationId) ||
    !("preferences" in body)
  )
    return Response.json(
      { error: "Choose a saved conversation." },
      { status: 400 }
    )
  const preferences = parseChatPreferences(body.preferences)
  if (!preferences)
    return Response.json(
      {
        error:
          "Chat settings are invalid. Instructions must be at most 1,000 characters.",
      },
      { status: 400 }
    )
  const model = preferences.model === "auto" ? "gpt-6-luna" : preferences.model
  if (!(await getAvailableChatModels()).some((entry) => entry.id === model))
    return Response.json(
      {
        error: "This model is unavailable. Choose another available GPT model.",
      },
      { status: 409 }
    )
  const saved = await createAdminClient().rpc("save_chat_preferences", {
    p_owner_id: user.id,
    p_material_id: id,
    p_conversation_id: body.conversationId,
    p_preferences: { ...preferences },
  })
  if (saved.error)
    return Response.json(
      {
        error:
          "Settings could not be saved. Refresh the conversation before trying again.",
      },
      { status: 409 }
    )
  return Response.json({ preferences }, { headers: privateHeaders })
}

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
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
    typeof body.question !== "string" ||
    !body.question.trim() ||
    body.question.length > 2000 ||
    typeof body.requestId !== "string" ||
    !uuid.test(body.requestId) ||
    (body.conversationId != null &&
      (typeof body.conversationId !== "string" ||
        !uuid.test(body.conversationId)))
  ) {
    return Response.json(
      { error: "Ask a question of up to 2,000 characters." },
      { status: 400 }
    )
  }
  const { id } = await params
  const material = await getMaterial(id)
  if (!material)
    return Response.json({ error: "Material not found." }, { status: 404 })
  const independent = material.source_type === "chat"
  const question = body.question.trim()
  const requestId = body.requestId
  const admin = createAdminClient()
  const reject = async (error: string, status: number): Promise<Response> => {
    if (independent) {
      const failed = await admin.rpc("fail_queued_chat_request", {
        p_owner_id: user.id,
        p_material_id: id,
        p_request_id: requestId,
      })
      if (failed.error)
        return Response.json(
          {
            error:
              "Your saved question could not be updated. Refresh this conversation before retrying.",
          },
          { status: 503 }
        )
    }
    try {
      return Response.json(
        {
          error,
          ...(await getMaterialChat(
            id,
            (body.conversationId ?? null) as string
          )),
        },
        { status, headers: privateHeaders }
      )
    } catch {
      /* The saved request remains authoritative when snapshot loading fails. */
    }
    return Response.json({ error }, { status, headers: privateHeaders })
  }
  const sourceIds = body.sourceIds ?? (independent ? [] : [id])
  if (
    !Array.isArray(sourceIds) ||
    (!independent && sourceIds.length < 1) ||
    sourceIds.length > 3 ||
    sourceIds.some(
      (sourceId) => typeof sourceId !== "string" || !uuid.test(sourceId)
    ) ||
    new Set(sourceIds).size !== sourceIds.length
  ) {
    return reject(
      independent
        ? "Choose up to three ready materials, or leave context empty."
        : "Choose one to three ready materials.",
      400
    )
  }
  if (!["ready", "partial"].includes(material.status))
    return Response.json(
      { error: "Your material is still processing." },
      { status: 409 }
    )
  let preferences: ChatPreferences
  let answerHistory: { role: string; text: string }[] = []
  try {
    const previous =
      typeof body.conversationId === "string"
        ? await getMaterialChat(id, body.conversationId)
        : null
    const parsed = parseChatPreferences(
      body.preferences ?? previous?.preferences
    )
    if (!parsed)
      return reject(
        "Chat settings are invalid. Instructions must be at most 1,000 characters.",
        400
      )
    preferences = parsed
    answerHistory =
      previous?.messages.filter((message) => message.state === "complete") ?? []
  } catch {
    return reject(
      "This conversation could not be loaded. Refresh before trying again.",
      409
    )
  }
  let sources: SourcePassage[] = []
  let useSemantic = false
  if (sourceIds.length && !preferences.webSearch) {
    const db = await createClient()
    const { data: materials, error: materialError } = await db
      .from("materials")
      .select("id,title,status,source_type,extraction_version")
      .in("id", sourceIds)
    if (
      materialError ||
      materials.length !== sourceIds.length ||
      materials.some(
        (m) =>
          m.source_type === "chat" || !["ready", "partial"].includes(m.status)
      )
    )
      return reject(
        "A selected source is unavailable. Choose your materials again.",
        409
      )
    try {
      const found = await retrieveSourcePassages(
        question,
        sourceIds as string[]
      )
      sources = found.sources
      useSemantic = semanticRetrievalEnabled() && found.semanticReady
    } catch {
      return reject(
        "Your sources could not be searched. Please try again.",
        503
      )
    }
    if (!sources.length)
      return reject(
        "No readable text is available in these sources. Choose another material or check extraction status.",
        409
      )
  }
  let prepared: PreparedAnswer
  let preparedSearch: PreparedSearch | undefined
  try {
    prepared = await prepareGroundedAnswer(question, sources, answerHistory, {
      allowGeneral: independent && sourceIds.length === 0,
      preferences,
      additionalCostUsd: useSemantic ? QUERY_EMBEDDING_MAX_COST_USD : 0,
      signal: request.signal,
    })
    if (preferences.webSearch)
      preparedSearch = await prepareWebSearch(question, request.signal)
  } catch (cause) {
    return reject(
      cause instanceof AnswerError || cause instanceof WebSearchError
        ? cause.message
        : "The selected model could not be prepared. Choose Auto or try again.",
      409
    )
  }
  const { data: reservation, error: reserveError } = await admin.rpc(
    "reserve_configured_chat_request",
    {
      // The SQL argument accepts NULL; generated RPC types do not express nullable inputs.
      p_owner_id: user.id,
      p_material_id: id,
      p_conversation_id: (body.conversationId ?? null) as string,
      p_source_ids: sourceIds as string[],
      p_request_id: requestId,
      p_question: question,
      p_limit: 20,
      p_configuration: {
        ...prepared.preferences,
        actualModel: prepared.model,
        maxOutputTokens: prepared.maxOutputTokens,
        maxCostUsd: prepared.maxCostUsd,
      },
    }
  )
  if (reserveError) {
    const quota = reserveError.message.includes("chat_quota_exceeded")
    const busy = reserveError.message.includes("answer_in_progress")
    return reject(
      quota
        ? "You’ve used your question allowance for this period."
        : busy
          ? "Another reply or study job is still running. Wait for it to finish, then retry your saved question."
          : "Your question could not be saved. Refresh this conversation and retry your saved question.",
      quota ? 429 : busy ? 409 : 503
    )
  }
  const state = reservation as {
    existing: boolean
    status: string
    conversationId: string
  }
  if (state.existing) {
    if (state.status === "succeeded")
      return Response.json(await getMaterialChat(id, state.conversationId), {
        headers: privateHeaders,
      })
    return Response.json(
      {
        error:
          "This question was already submitted. Refresh its conversation before retrying.",
        ...(await getMaterialChat(id, state.conversationId)),
      },
      { status: 409, headers: privateHeaders }
    )
  }
  const run = new AbortController()
  let writable = true
  const disconnect = () => {
    writable = false
    run.abort()
  }
  request.signal.addEventListener("abort", disconnect, { once: true })
  if (request.signal.aborted) disconnect()
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!writable) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          disconnect()
        }
      }
      let partial = ""
      let lastCheckpoint = 0
      let searchUsage: SearchUsage | undefined
      try {
        send({
          type: "start",
          ...(await getMaterialChat(id, state.conversationId)),
        })
        if (sourceIds.length && !prepared.preferences.webSearch) {
          const frozen = await retrieveSourcePassages(
            question,
            sourceIds as string[],
            undefined,
            requestId
          )
          sources = frozen.sources
          if (!sources.length)
            throw new AnswerError(
              "A source changed while your question was being saved. Refresh and try again."
            )
          if (useSemantic && frozen.semanticReady) {
            const embedding = await embedRetrievalQuery(
              user.id,
              requestId,
              run.signal
            )
            sources = (
              await retrieveSourcePassages(
                question,
                sourceIds as string[],
                embedding,
                requestId
              )
            ).sources
            if (!sources.length)
              throw new AnswerError(
                "A source changed during your search. Refresh before trying again."
              )
          }
          prepared = await prepareGroundedAnswer(
            question,
            sources,
            answerHistory,
            {
              allowGeneral: false,
              preferences: prepared.preferences,
              additionalCostUsd: useSemantic ? QUERY_EMBEDDING_MAX_COST_USD : 0,
              signal: run.signal,
            }
          )
        }
        if (preparedSearch) {
          const search = await searchWeb(preparedSearch, run.signal)
          searchUsage = search.usage
          const checkpoint = await admin.rpc("checkpoint_chat_search", {
            p_owner_id: user.id,
            p_request_id: requestId,
            p_evidence: {
              text: search.evidence.text,
              sources: search.evidence.sources.map((source) => ({ ...source })),
            },
            p_usage: { ...searchUsage },
          })
          if (checkpoint.error)
            throw new AnswerError(
              "Search could not be saved. Refresh before retrying.",
              undefined,
              true
            )
          if (!checkpoint.data || run.signal.aborted)
            throw new AnswerError("Reply stopped.", undefined, false, "", true)
          prepared = await prepareGroundedAnswer(question, [], answerHistory, {
            allowGeneral: true,
            preferences: prepared.preferences,
            webEvidence: search.evidence,
            signal: run.signal,
          })
        }
        const answer = await groundedAnswer(question, sources, answerHistory, {
          signal: run.signal,
          allowGeneral: independent && sourceIds.length === 0,
          prepared,
          onText: async (text) => {
            partial = text
            send({ type: "delta", text })
            if (Date.now() - lastCheckpoint < 750) return !run.signal.aborted
            lastCheckpoint = Date.now()
            const result = await admin.rpc("checkpoint_chat", {
              p_owner_id: user.id,
              p_request_id: requestId,
              p_text: text,
            })
            if (result.error)
              throw new AnswerError(
                "The reply could not be saved. Your question is still here.",
                undefined,
                true,
                text
              )
            return result.data === true && !run.signal.aborted
          },
        })
        const { error: saveError } = await admin.rpc("settle_chat_request", {
          p_owner_id: user.id,
          p_request_id: requestId,
          p_state: "complete",
          p_text: answer.answer,
          p_citations: answer.citations,
          p_usage: {
            ...answer.usage,
            web_sources: answer.webSources.map((source) => ({ ...source })),
            ...(searchUsage ? { search: { ...searchUsage } } : {}),
          },
        })
        if (saveError)
          throw new AnswerError(
            "The reply could not be saved completely. Refresh before retrying.",
            answer.usage,
            true,
            partial
          )
        send({
          type: "done",
          ...(await getMaterialChat(id, state.conversationId)),
        })
      } catch (cause) {
        if (cause instanceof WebSearchError) searchUsage = cause.usage
        const failure =
          cause instanceof AnswerError
            ? cause
            : cause instanceof WebSearchError
              ? new AnswerError(
                  cause.message,
                  undefined,
                  cause.uncertain,
                  partial
                )
              : new AnswerError(
                  "Reply interrupted. Refresh to reconnect to your saved conversation.",
                  undefined,
                  true,
                  partial
                )
        await admin.rpc("settle_chat_request", {
          p_owner_id: user.id,
          p_request_id: requestId,
          p_state:
            failure.stopped && !request.signal.aborted
              ? "stopped"
              : failure.uncertain
                ? "interrupted"
                : "failed",
          p_text: failure.partialAnswer || partial,
          p_citations: [],
          p_usage: {
            ...(failure.usage ?? {}),
            ...(searchUsage ? { search: { ...searchUsage } } : {}),
          },
        })
        send({
          type: "error",
          error: failure.message,
          ...(await getMaterialChat(id, state.conversationId)),
        })
      } finally {
        request.signal.removeEventListener("abort", disconnect)
        if (writable) {
          writable = false
          controller.close()
        }
      }
    },
    cancel: disconnect,
  })
  return new Response(stream, {
    headers: {
      ...privateHeaders,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}
