export interface SourceCitation {
  segment_id: string
  quote: string
}

export const SOURCE_QUOTE_MAX_LENGTH = 600
const SOURCE_SPAN_MAX_COUNT = 256

interface CitationSource {
  id: string
  text: string
}

export interface SourceCitationSpan extends SourceCitation {
  id: string
}

export function createSourceCitationSpans(
  sources: CitationSource[]
): SourceCitationSpan[] {
  const spans: SourceCitationSpan[] = []
  for (const source of sources) {
    const characters = [...source.text]
    for (let start = 0; start < characters.length;) {
      let end = Math.min(start + SOURCE_QUOTE_MAX_LENGTH, characters.length)
      if (end < characters.length) {
        for (let boundary = end; boundary > start + 300; boundary--) {
          if (/\s/u.test(characters[boundary]!)) {
            end = boundary
            break
          }
        }
      }
      const quote = characters.slice(start, end).join("").trim()
      start = end
      if (!quote) continue
      spans.push({ id: `span_${spans.length}`, segment_id: source.id, quote })
      if (spans.length === SOURCE_SPAN_MAX_COUNT) return spans
    }
  }
  return spans
}

export function resolveSourceCitationSpans(
  selectedIds: unknown[],
  spans: SourceCitationSpan[],
  sources: CitationSource[]
) {
  const citations: SourceCitation[] = []
  for (const id of selectedIds) {
    const span = spans.find((entry) => entry.id === id)
    if (!span) return { citations: [], error: "source_span_invalid" as const }
    citations.push({ segment_id: span.segment_id, quote: span.quote })
  }
  return canonicalizeSourceCitations(citations, sources)
}

function originalQuote(source: string, quote: string): string | null {
  if (!quote.trim()) return null
  if (source.includes(quote)) return quote

  const target = quote.replace(/\s+/gu, " ").trim()
  let normalized = ""
  const offsets: number[] = []
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!
    if (/\s/u.test(character)) {
      if (normalized.endsWith(" ")) continue
      normalized += " "
    } else normalized += character
    offsets.push(index)
  }

  const start = normalized.indexOf(target)
  if (start < 0) return null
  // Return the original span so the database still verifies an exact substring.
  return source.slice(
    offsets[start],
    offsets[start + target.length] ?? source.length
  )
}

export function canonicalizeSourceCitations(
  citations: SourceCitation[],
  sources: CitationSource[]
): {
  citations: SourceCitation[]
  error:
    | "source_segment_invalid"
    | "source_quote_unmatched"
    | "source_quote_too_long"
    | null
} {
  const verified: SourceCitation[] = []
  for (const citation of citations) {
    const source = sources.find((entry) => entry.id === citation?.segment_id)
    if (!source) return { citations: [], error: "source_segment_invalid" }
    const quote =
      typeof citation.quote === "string"
        ? originalQuote(source.text, citation.quote)
        : null
    if (quote === null)
      return { citations: [], error: "source_quote_unmatched" }
    if ([...quote].length > SOURCE_QUOTE_MAX_LENGTH)
      return { citations: [], error: "source_quote_too_long" }
    verified.push({ segment_id: source.id, quote })
  }
  return { citations: verified, error: null }
}
