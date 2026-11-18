export type ChatModelId = "gpt-6-luna" | "gpt-6-sol" | "gpt-6-astra"
export type ChatResponseLength = "concise" | "balanced" | "detailed"

export interface ChatWebSource {
  url: string
  title: string
}

export interface ChatPreferences {
  model: "auto" | ChatModelId
  responseLength: ChatResponseLength
  studyMode: boolean
  webSearch: boolean
  instructions: string
}

export interface ChatModelOption {
  id: ChatModelId
  label: string
  description: string
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  model: "auto",
  responseLength: "balanced",
  studyMode: false,
  webSearch: false,
  instructions: "",
}

export function parseChatPreferences(value: unknown): ChatPreferences | null {
  if (value === undefined || value === null)
    return { ...DEFAULT_CHAT_PREFERENCES }
  if (typeof value !== "object" || Array.isArray(value)) return null
  const settings = value as Record<string, unknown>
  const model = settings.model ?? "auto"
  const responseLength = settings.responseLength ?? "balanced"
  const studyMode = settings.studyMode ?? false
  const webSearch = settings.webSearch ?? false
  const instructions = settings.instructions ?? ""
  if (
    !["auto", "gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].includes(
      String(model)
    ) ||
    !["concise", "balanced", "detailed"].includes(String(responseLength)) ||
    typeof studyMode !== "boolean" ||
    typeof webSearch !== "boolean" ||
    typeof instructions !== "string" ||
    instructions.length > 1000
  )
    return null
  return {
    model: model as ChatPreferences["model"],
    responseLength: responseLength as ChatResponseLength,
    studyMode,
    webSearch,
    instructions: instructions.trim(),
  }
}
