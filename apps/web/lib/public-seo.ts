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

export const SEARCH_TITLE = "Abstruck AI"
export const SEARCH_DESCRIPTION =
  "Turn class materials into notes, cited answers, and practice."
export const SEARCH_IMAGE = "/abstruck-ai-f6s.png"

export function publicUrl(path: string): string {
  return new URL(path, MARKETING_ORIGIN).href
}
