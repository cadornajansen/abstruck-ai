"use client"

import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import type {
  GraphOutput,
  StudyOutputCitation,
  TimelineOutput,
} from "@/lib/study-output-types"
import { StudyOutputCitations } from "./study-output-citations"

function graphLayout(output: GraphOutput) {
  const depths = new Map<string, number>([[output.rootId, 0]])
  const queue = [output.rootId]
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!
    for (const edge of output.edges.filter((item) => item.from === id)) {
      if (!depths.has(edge.to)) {
        depths.set(edge.to, (depths.get(id) ?? 0) + 1)
        queue.push(edge.to)
      }
    }
  }
  for (const node of output.nodes)
    if (!depths.has(node.id)) depths.set(node.id, 0)
  const maxDepth = Math.max(0, ...depths.values())
  const rows = Array.from({ length: maxDepth + 1 }, (_, depth) =>
    output.nodes.filter((node) => depths.get(node.id) === depth)
  )
  const height = Math.max(
    300,
    Math.max(...rows.map((row) => row.length)) * 120 + 60
  )
  const width = Math.max(640, (maxDepth + 1) * 240)
  const positions = new Map(
    output.nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0
      const row = rows[depth]!
      return [
        node.id,
        {
          x: depth * 240 + 120,
          y: 30 + (row.indexOf(node) + 0.5) * ((height - 60) / row.length),
        },
      ] as const
    })
  )
  return { width, height, positions }
}

function labelLines(label: string): string[] {
  const words = label.split(/\s+/)
  const lines: string[] = []
  for (const word of words) {
    const last = lines[lines.length - 1]
    if (last && `${last} ${word}`.length <= 23)
      lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines.slice(0, 3)
}

export function StudyOutputGraph({
  output,
  onCitation,
}: {
  output: GraphOutput
  onCitation: (citation: StudyOutputCitation) => void
}) {
  const [selectedId, setSelectedId] = useState(output.rootId)
  const reducedMotion = useReducedMotion()
  const selected =
    output.nodes.find((node) => node.id === selectedId) ?? output.nodes[0]
  const markerId = useId().replace(/:/g, "")
  const layout = graphLayout(output)
  return (
    <div className="flex flex-col gap-5">
      <div
        className="max-h-[560px] overflow-auto rounded-[20px] border bg-muted/10 p-3"
        tabIndex={0}
        aria-label="Scrollable diagram"
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          className="mx-auto min-w-[640px]"
          role="img"
          aria-label={output.title}
        >
          <title>{output.title}</title>
          <desc>
            {output.nodes.length} connected topics. Select a topic below to read
            its detail and sources.
          </desc>
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-muted-foreground"
              />
            </marker>
          </defs>
          {output.edges.map((edge, index) => {
            const from = layout.positions.get(edge.from)
            const to = layout.positions.get(edge.to)
            if (!from || !to) return null
            const middle = (from.x + to.x) / 2
            const fromWidth =
              output.nodes.find((node) => node.id === edge.from)?.kind ===
              "decision"
                ? 105
                : 90
            const toWidth =
              output.nodes.find((node) => node.id === edge.to)?.kind ===
              "decision"
                ? 105
                : 90
            return (
              <g key={`${edge.from}:${edge.to}:${index}`}>
                <path
                  d={`M${from.x + fromWidth},${from.y} C${middle},${from.y} ${middle},${to.y} ${to.x - toWidth},${to.y}`}
                  fill="none"
                  className="stroke-muted-foreground/50"
                  strokeWidth="1.5"
                  markerEnd={
                    output.kind === "flowchart"
                      ? `url(#${markerId})`
                      : undefined
                  }
                />
                {edge.label && (
                  <text
                    x={middle}
                    y={(from.y + to.y) / 2 - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    <title>{edge.label}</title>
                    {edge.label.length > 24
                      ? `${edge.label.slice(0, 23)}…`
                      : edge.label}
                  </text>
                )}
              </g>
            )
          })}
          {output.nodes.map((node) => {
            const position = layout.positions.get(node.id)!
            const lines = labelLines(node.label)
            return (
              <g
                key={node.id}
                transform={`translate(${position.x},${position.y})`}
                onClick={() => setSelectedId(node.id)}
                className="cursor-pointer"
              >
                {node.kind === "decision" ? (
                  <path
                    d="M-105 0 L0 -56 L105 0 L0 56 Z"
                    className={cn(
                      "fill-background stroke-border",
                      selected?.id === node.id && "fill-info stroke-info-border"
                    )}
                    strokeWidth="1.5"
                  />
                ) : (
                  <rect
                    x={-90}
                    y={-42}
                    width={180}
                    height={84}
                    rx={node.kind === "start" || node.kind === "end" ? 42 : 16}
                    className={cn(
                      "fill-background stroke-border",
                      selected?.id === node.id && "fill-info stroke-info-border"
                    )}
                    strokeWidth="1.5"
                  />
                )}
                {lines.map((line, index) => (
                  <text
                    key={index}
                    x={0}
                    y={(index - (lines.length - 1) / 2) * 18 + 4}
                    textAnchor="middle"
                    className="fill-foreground text-[12px]"
                  >
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Diagram topics">
        {output.nodes.map((node) => (
          <Button
            key={node.id}
            variant={selected?.id === node.id ? "secondary" : "ghost"}
            size="sm"
            className="h-auto max-w-full rounded-full text-left whitespace-normal"
            onClick={() => setSelectedId(node.id)}
          >
            {node.label}
          </Button>
        ))}
      </div>
      <AnimatePresence initial={false} mode="wait">
        {selected && (
          <motion.section
            key={selected.id}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: reducedMotion ? 0 : 0.14 }}
            className="flex flex-col gap-3 rounded-[16px] border p-4"
          >
            <h3 className="text-base font-medium">{selected.label}</h3>
            <p className="text-sm leading-6 whitespace-pre-wrap">
              {selected.detail}
            </p>
            <StudyOutputCitations
              citations={selected.citations}
              onCitation={onCitation}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

export function StudyOutputTimeline({
  output,
  onCitation,
}: {
  output: TimelineOutput
  onCitation: (citation: StudyOutputCitation) => void
}) {
  return (
    <ol className="ml-3 flex flex-col border-l border-border">
      {output.events.map((event) => (
        <li
          key={event.id}
          className="relative flex flex-col gap-3 pb-8 pl-7 last:pb-0"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 -left-1.5 size-3 rounded-full border-2 border-background bg-info-accent"
          />
          <p className="text-xs font-medium text-muted-foreground">
            {event.date}
          </p>
          <h3 className="text-base font-medium">{event.label}</h3>
          <p className="text-sm leading-6 whitespace-pre-wrap">
            {event.detail}
          </p>
          <StudyOutputCitations
            citations={event.citations}
            onCitation={onCitation}
          />
        </li>
      ))}
    </ol>
  )
}
