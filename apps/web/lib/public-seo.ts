import { MARKETING_ORIGIN } from "@/lib/release"

export const INDEXED_MARKETING_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/about",
  "/blog",
  "/contact",
  "/features",
  "/pricing",
  "/privacy",
  "/terms",
])

export const SEARCH_TITLE = "AI study workspace for students"
export const SEARCH_DESCRIPTION =
  "Turn PDFs, slides, lecture recordings, and notes into cited answers, flashcards, and quizzes in one study workspace."
export const SEARCH_IMAGE = "/blog/abstruck-study-workspace.jpg"

export function publicUrl(path: string): string {
  return new URL(path, MARKETING_ORIGIN).href
}
