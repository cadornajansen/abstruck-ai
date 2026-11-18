import type {
  StudyOutputArtifact,
  StudyOutputContent,
  StudyOutputType,
} from "@/lib/study-output-types"

export interface StudySet {
  id: string
  materialId: string | null
  sourceUnavailable?: boolean
  type: StudyToolType
  title: string
  status: "draft" | "queued" | "generating" | "ready" | "failed"
  content: string
  revision: number
  updatedAt: string
  errorCode?: string | null
}

export interface StudyCitation {
  material_id: string
  page: number
  quote: string
}

export interface StudyCard {
  id: string
  logicalId?: string
  logical_id?: string
  position: number
  kind: string
  prompt: { front: string; hint?: string }
  answer: { back: string; explanation?: string }
  citations: StudyCitation[]
  review?: { starred: boolean; due_at: string | null }
}

export type FlashcardReviewMode = "fast" | "spaced"

export interface FlashcardReviewSession {
  attemptId: string
  versionId: string
  mode: FlashcardReviewMode
  cards: StudyCard[]
  reviewedCardIds: string[]
  completed: boolean
}

export interface FlashcardReviewStatus {
  active: Record<FlashcardReviewMode, FlashcardReviewSession | null>
  session: FlashcardReviewSession | null
  serverTime: string
}

export interface StudySetDetail {
  studySet: StudySet
  version: null | {
    id: string
    version: number
    content:
      | StudyOutputContent
      | {
          markdown?: string
          description?: string
          citations?: StudyCitation[]
        }
    settings: Record<string, unknown>
  }
  items: StudyCard[]
  artifact?: StudyOutputArtifact
}

export class StudyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public studySet?: StudySet
  ) {
    super(message)
    this.name = "StudyApiError"
  }
}

export async function studyRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = await response.json()
  if (!response.ok)
    throw new StudyApiError(
      typeof data.error === "string"
        ? data.error
        : "This request couldn’t be completed. Please try again.",
      response.status,
      data.studySet
    )
  return data as T
}

export function studyError(error: unknown): string {
  return error instanceof StudyApiError
    ? error.message
    : "We couldn’t connect. Your work is still here; please try again."
}

export function exportStudyMarkdown(title: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `${
    title
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 80) || "abstruck-notes"
  }.md`
  link.click()
  URL.revokeObjectURL(url)
}
export type StudyToolType =
  "notes" | "summary" | "flashcards" | "quiz" | "exam" | StudyOutputType

export interface RequestedStudyTool {
  type: StudyToolType
  requestId: string
}
