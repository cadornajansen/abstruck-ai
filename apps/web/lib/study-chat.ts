import "server-only"

import { createClient } from "@/lib/supabase/server"
import { formatSourceTime } from "@/lib/source-position"
import {
  DEFAULT_CHAT_PREFERENCES,
  parseChatPreferences,
  type ChatWebSource,
} from "@/lib/chat-preferences"
import {
  answerCostCeiling,
  getAvailableChatModels,
  isWebSearchAvailable,
} from "@/lib/openai/chat-models"

export interface SavedMessage {
  id: string
  requestId: string
  role: "user" | "assistant"
  text: string
  state:
    "queued" | "pending" | "complete" | "stopped" | "interrupted" | "failed"
  citations: {
    page: number
    label: string
    materialId: string
    timeMs?: number
  }[]
  webSources: ChatWebSource[]
}

export async function getMaterialChat(
  materialId: string,
  selectedId?: string | null
) {
  const db = await createClient()
  const [{ data: conversations, error }, { data: material }] =
    await Promise.all([
      db
        .from("conversations")
        .select(
          "id,title,updated_at,preferences,conversation_sources(material_id)"
        )
        .eq("material_id", materialId)
        .order("updated_at", { ascending: false })
        .limit(50),
      db
        .from("materials")
        .select("source_type")
        .eq("id", materialId)
        .maybeSingle(),
    ])
  if (error || !material)
    throw new Error("Your conversations could not be loaded.")
  const selected = selectedId
    ? conversations.find((c) => c.id === selectedId)
    : conversations[0]
  if (selectedId && !selected) throw new Error("Conversation not found.")
  const messages = selected ? await getConversationMessages(selected.id) : []
  const sourceIds =
    selected?.conversation_sources.map((s) => s.material_id) ??
    (material.source_type === "chat" ? [] : [materialId])
  const queued = messages.find(
    (message) => message.role === "user" && message.state === "queued"
  )
  return {
    preferences: parseChatPreferences(selected?.preferences) ?? {
      ...DEFAULT_CHAT_PREFERENCES,
    },
    availableModels: await getAvailableChatModels(),
    webSearchAvailable: await isWebSearchAvailable(),
    maxAnswerCostUsd: answerCostCeiling(),
    conversationId: selected?.id ?? null,
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updated_at,
    })),
    sourceIds,
    pendingPrompt:
      queued && selected
        ? {
            question: queued.text,
            requestId: queued.requestId,
            conversationId: selected.id,
            sourceIds,
            preferences: parseChatPreferences(selected.preferences) ?? {
              ...DEFAULT_CHAT_PREFERENCES,
            },
          }
        : null,
    messages,
  }
}

export async function getConversationMessages(
  conversationId: string
): Promise<SavedMessage[]> {
  const db = await createClient()
  const { data, error } = await db
    .from("messages")
    .select(
      "id,request_id,role,content,state,web_sources,message_citations(page,source_segments(material_id,locator))"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("role", { ascending: true })
    .limit(1000)
  if (error) throw new Error("Your conversation could not be loaded.")
  return data.reverse().map((message) => ({
    id: message.id,
    requestId: message.request_id,
    role: message.role as SavedMessage["role"],
    text: message.content,
    state: message.state as SavedMessage["state"],
    webSources:
      message.state === "complete" && Array.isArray(message.web_sources)
        ? message.web_sources.flatMap((entry) => {
            if (
              !entry ||
              typeof entry !== "object" ||
              Array.isArray(entry) ||
              typeof entry.url !== "string" ||
              typeof entry.title !== "string"
            )
              return []
            return [{ url: entry.url, title: entry.title }]
          })
        : [],
    citations:
      message.state === "complete"
        ? message.message_citations.flatMap((c) => {
            const source = c.source_segments
            if (!source) return []
            const locator = source.locator as {
              type?: string
              start_ms?: number
            }
            return [
              {
                page: c.page,
                materialId: source.material_id,
                label:
                  locator.type === "time" &&
                  typeof locator.start_ms === "number"
                    ? formatSourceTime(locator.start_ms)
                    : locator.type === "paragraph"
                      ? `¶ ${c.page}`
                      : `p. ${c.page}`,
                ...(locator.type === "time" &&
                typeof locator.start_ms === "number"
                  ? { timeMs: locator.start_ms }
                  : {}),
              },
            ]
          })
        : [],
  }))
}
