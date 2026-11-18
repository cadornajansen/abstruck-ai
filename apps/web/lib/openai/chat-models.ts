import "server-only"

import OpenAI from "openai"
import type { ChatModelId, ChatModelOption } from "@/lib/chat-preferences"

// OpenAI Standard, short-context USD/1M tokens, verified 2026-11-02.
// https://developers.openai.com/api/docs/pricing
export const CHAT_MODELS: Record<
  ChatModelId,
  ChatModelOption & {
    cachedInput: number
    cacheWrite: number
    reasoning: "none" | "low"
  }
> = {
  "gpt-6-luna": {
    id: "gpt-6-luna",
    label: "GPT-6 Luna",
    description: "Fast, efficient everyday study",
    inputUsdPerMillion: 0.1,
    outputUsdPerMillion: 0.5,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    reasoning: "none",
  },
  "gpt-6-sol": {
    id: "gpt-6-sol",
    label: "GPT-6 Sol",
    description: "More capable, higher usage",
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cachedInput: 0.2,
    cacheWrite: 2.5,
    reasoning: "none",
  },
  "gpt-6-astra": {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    description: "Deep reasoning, highest usage",
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 50,
    cachedInput: 1,
    cacheWrite: 12.5,
    reasoning: "low",
  },
}

let catalog:
  | {
      until: number
      result: Promise<{ models: ChatModelOption[]; webSearch: boolean }>
    }
  | undefined

export function answerCostCeiling(): number {
  const configured = Number(process.env.OPENAI_CHAT_MAX_COST_USD ?? "0.02")
  return Number.isFinite(configured) && configured > 0 && configured <= 1
    ? configured
    : 0.02
}

function getCatalog(): Promise<{
  models: ChatModelOption[]
  webSearch: boolean
}> {
  if (catalog && catalog.until > Date.now()) return catalog.result
  const result = (async () => {
    if (!process.env.OPENAI_API_KEY) return { models: [], webSearch: false }
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 0,
      timeout: 10_000,
    })
    const response = await client.models.list()
    const accessible = new Set(response.data.map((model) => model.id))
    const configured = new Set(
      (process.env.OPENAI_CHAT_MODELS ?? "gpt-6-luna,gpt-6-sol,gpt-6-astra")
        .split(",")
        .map((id) => id.trim())
    )
    const models = Object.values(CHAT_MODELS)
      .filter((model) => configured.has(model.id) && accessible.has(model.id))
      .map(
        ({
          id,
          label,
          description,
          inputUsdPerMillion,
          outputUsdPerMillion,
        }) => ({
          id,
          label,
          description,
          inputUsdPerMillion,
          outputUsdPerMillion,
        })
      )
    return { models, webSearch: accessible.has("gpt-4o-mini") }
  })().catch(() => {
    catalog = undefined
    return { models: [], webSearch: false }
  })
  catalog = { until: Date.now() + 30 * 60_000, result }
  return result
}

export async function getAvailableChatModels(): Promise<ChatModelOption[]> {
  // A selectable model must fit the balanced reply cap before any input cost.
  return (await getCatalog()).models.filter(
    (model) =>
      (1600 * model.outputUsdPerMillion) / 1_000_000 < answerCostCeiling()
  )
}

export async function isWebSearchAvailable(): Promise<boolean> {
  // The native search call is accessible, but the first complete acceptance
  // reply failed citation validation. Enable only after a real bounded pass.
  return (
    process.env.OPENAI_CHAT_WEB_SEARCH_VERIFIED === "true" &&
    (await getCatalog()).webSearch
  )
}
