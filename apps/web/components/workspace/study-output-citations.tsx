"use client"

import { useState } from "react"
import { NavArrowDown } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import type { StudyCitation } from "./study-tools-types"

const panelMotion =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-180 ease-out data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none"

function uniqueCitations<Citation extends StudyCitation>(
  citations: Citation[]
): Citation[] {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.material_id}:${citation.page}:${citation.quote}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function StudyOutputCitations<Citation extends StudyCitation>({
  citations,
  onCitation,
}: {
  citations: Citation[]
  onCitation: (citation: Citation) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sources = uniqueCitations(citations)
  if (!sources.length) return null
  function chips(items: Citation[], offset = 0) {
    return items.map((citation, index) => (
      <Button
        key={`${citation.material_id}:${citation.page}:${index}`}
        variant="secondary"
        size="xs"
        className="h-6 rounded-full px-2 text-[11px] font-normal text-muted-foreground hover:text-foreground"
        title={citation.quote}
        aria-label={`Open source ${offset + index + 1}`}
        onClick={() => onCitation(citation)}
      >
        Source {offset + index + 1}
      </Button>
    ))
  }
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className="flex flex-col gap-1.5"
      aria-label="Supporting sources"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {chips(sources.slice(0, 3))}
        {sources.length > 3 && (
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="h-6 rounded-full px-2 text-[11px] font-normal text-muted-foreground"
              />
            }
          >
            {expanded ? "See less" : `See more (${sources.length - 3})`}
          </CollapsibleTrigger>
        )}
      </div>
      {sources.length > 3 && (
        <CollapsibleContent className={panelMotion}>
          <div className="flex flex-wrap gap-1.5">
            {chips(sources.slice(3), 3)}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

export function StudyOutputSources<Citation extends StudyCitation>({
  citations,
  onCitation,
}: {
  citations: Citation[]
  onCitation: (citation: Citation) => void
}) {
  const sources = uniqueCitations(citations)
  if (!sources.length) return null
  return (
    <Collapsible className="min-w-0">
      <CollapsibleTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="group/source-toggle rounded-full text-muted-foreground"
          />
        }
      >
        Sources{" "}
        <span className="text-xs text-muted-foreground/70 tabular-nums">
          {sources.length}
        </span>
        <NavArrowDown
          aria-hidden="true"
          className="transition-transform duration-180 group-data-open/source-toggle:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={panelMotion}>
        <div className="px-2 pt-2">
          <StudyOutputCitations citations={sources} onCitation={onCitation} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
