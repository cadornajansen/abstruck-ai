export interface SharedCitation {
  sourceKey: string
  page: number
  quote: string
}

export interface SharedSource {
  key: string
  title: string
  type: string
  mime: string
}

export interface SharedFlashcard {
  kind: "flashcard"
  key: string
  position: number
  front: string
  back: string
  hint: string
  explanation: string
  citations: SharedCitation[]
}

export interface SharedQuestion {
  kind: "question"
  key: string
  position: number
  type: string
  text: string
  options: { id: string; text: string }[]
}

export interface SharedSnapshot {
  title: string
  type: "notes" | "summary" | "flashcards" | "quiz" | "exam" | StudyOutputType
  version: number
  markdown: string
  description: string
  citations: SharedCitation[]
  items: (SharedFlashcard | SharedQuestion)[]
  sources: SharedSource[]
  output?: StudyOutputContent<SharedCitation>
  hasArtifact?: boolean
}

export interface ShareDisclosure {
  content: string
  originals: string
  limitations: string
}

export interface SharePreview {
  studySetId: string
  versionId: string | null
  revision: number
  includeOriginals: boolean
  snapshot: SharedSnapshot
  disclosure: ShareDisclosure
  sources: (SharedSource & { available: boolean })[]
}

export interface ShareMetadata {
  id: string
  studySetId: string
  versionId: string
  title: string
  type: SharedSnapshot["type"]
  version: number
  includeOriginals: boolean
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export interface SharedOutput {
  snapshot: SharedSnapshot
  sharedAt: string
  expiresAt: string | null
  includeOriginals: boolean
  sourceTtlSeconds: 60
}

export interface SharedSourceLink {
  url: string
  mime: string
  fileName: string
  expiresAt: string
}
import type { StudyOutputContent, StudyOutputType } from "./study-output-types"

export interface SharedArtifactLink extends SharedSourceLink {
  mime: "audio/mpeg" | "video/mp4"
  bytes: number
  durationMs: number
}
