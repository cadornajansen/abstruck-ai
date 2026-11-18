"use client"

import { lazy, Suspense, useEffect, useState } from "react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import type { SharedArtifactLink, SharedCitation } from "@/lib/sharing-types"
import type {
  StudyOutputArtifact,
  StudyOutputCitation,
  StudyOutputContent,
} from "@/lib/study-output-types"
import { StudyOutputGraph, StudyOutputTimeline } from "./study-output-diagram"
import { StudyOutputInteractive } from "./study-output-interactive"
import { StudyOutputMedia } from "./study-output-media"
import { StudyOutputSources } from "./study-output-citations"
import { sharingRequest } from "./sharing-request"

const StudyOutputChart = lazy(() =>
  import("./study-output-chart").then((module) => ({
    default: module.StudyOutputChart,
  }))
)

// The shared renderer uses opaque source aliases, never private material/segment IDs.
function displayCitations(citations: SharedCitation[]): StudyOutputCitation[] {
  return citations.map((citation, index) => ({
    material_id: citation.sourceKey,
    segment_id: `${citation.sourceKey}:${citation.page}:${index}`,
    page: citation.page,
    quote: citation.quote,
  }))
}

function displayOutput(
  output: StudyOutputContent<SharedCitation>
): StudyOutputContent {
  const citations = displayCitations(output.citations)
  switch (output.kind) {
    case "mind-map":
    case "flowchart":
      return {
        ...output,
        citations,
        nodes: output.nodes.map((node) => ({
          ...node,
          citations: displayCitations(node.citations),
        })),
      }
    case "timeline":
      return {
        ...output,
        citations,
        events: output.events.map((event) => ({
          ...event,
          citations: displayCitations(event.citations),
        })),
      }
    case "bar-chart":
    case "line-chart":
      return {
        ...output,
        citations,
        series: output.series.map((series) => ({
          ...series,
          points: series.points.map((point) => ({
            ...point,
            citations: displayCitations(point.citations),
          })),
        })),
      }
    case "interactive":
      return {
        ...output,
        citations,
        steps: output.steps.map((step) => ({
          ...step,
          citations: displayCitations(step.citations),
        })),
      }
    case "podcast":
      return {
        ...output,
        citations,
        script: output.script.map((part) => ({
          ...part,
          citations: displayCitations(part.citations),
        })),
      }
    case "video":
      return {
        ...output,
        citations,
        slides: output.slides.map((slide) => ({
          ...slide,
          citations: displayCitations(slide.citations),
        })),
      }
  }
}

export function SharingAdvancedSnapshot({
  output: shared,
  hasArtifact,
  token,
}: {
  output: StudyOutputContent<SharedCitation>
  hasArtifact: boolean
  token?: string
}) {
  const output = displayOutput(shared)
  const [citation, setCitation] = useState<StudyOutputCitation | null>(null)
  const [artifact, setArtifact] = useState<StudyOutputArtifact>()
  const [loading, setLoading] = useState(!!token && hasArtifact)
  const expectedMime = output.kind === "podcast" ? "audio/mpeg" : "video/mp4"

  useEffect(() => {
    setArtifact(undefined)
    if (!token || !hasArtifact) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    sharingRequest<SharedArtifactLink>("/api/shared/artifact", {
      credentials: "omit",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((link) => {
        if (!controller.signal.aborted && link.mime === expectedMime)
          setArtifact(link)
      })
      .catch(() => {
        // The player can renew authorization automatically; the saved script remains readable.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, hasArtifact, expectedMime])

  async function renew(): Promise<StudyOutputArtifact> {
    if (!token) throw new Error("Playback requires an active shared link.")
    const link = await sharingRequest<SharedArtifactLink>(
      "/api/shared/artifact",
      {
        credentials: "omit",
        headers: { Authorization: `Bearer ${token}` },
      }
    )
    if (link.mime !== expectedMime) throw new Error("Playback unavailable.")
    setArtifact(link)
    return link
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {output.description && (
        <p className="text-sm leading-6 text-muted-foreground">
          {output.description}
        </p>
      )}
      {output.kind === "interactive" && (
        <p className="text-xs leading-6 text-muted-foreground">
          You can practise with this saved output. Your answers here are not
          saved or sent to its owner.
        </p>
      )}
      {output.kind === "mind-map" || output.kind === "flowchart" ? (
        <StudyOutputGraph output={output} onCitation={setCitation} />
      ) : output.kind === "timeline" ? (
        <StudyOutputTimeline output={output} onCitation={setCitation} />
      ) : output.kind === "bar-chart" || output.kind === "line-chart" ? (
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <StudyOutputChart output={output} onCitation={setCitation} />
        </Suspense>
      ) : output.kind === "interactive" ? (
        <StudyOutputInteractive output={output} onCitation={setCitation} />
      ) : output.kind === "podcast" || output.kind === "video" ? (
        token ? (
          loading ? (
            <Skeleton
              className="h-32 w-full rounded-xl"
              aria-label="Loading shared playback"
            />
          ) : (
            <StudyOutputMedia
              output={output}
              artifact={artifact}
              onRenew={renew}
              onCitation={setCitation}
            />
          )
        ) : (
          <div className="flex flex-col gap-4 text-sm leading-6">
            <p className="text-muted-foreground">
              The saved generated{" "}
              {output.kind === "podcast" ? "audio" : "video"} and this script
              will be included. Original source files stay separate.
            </p>
            {output.kind === "podcast"
              ? output.script.map((part, index) => (
                  <p key={index}>
                    {part.speaker}: {part.text}
                  </p>
                ))
              : output.slides.map((slide) => (
                  <section key={slide.id} className="flex flex-col gap-2">
                    <h3 className="font-medium">{slide.title}</h3>
                    <p>{slide.narration}</p>
                  </section>
                ))}
          </div>
        )
      ) : null}
      <StudyOutputSources
        citations={output.citations}
        onCitation={setCitation}
      />
      <Dialog
        open={!!citation}
        onOpenChange={(open) => {
          if (!open) setCitation(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Supporting source</DialogTitle>
            <DialogDescription>
              Location {citation?.page}. This quote was included with the saved
              output. Original files require explicit inclusion by the owner.
            </DialogDescription>
          </DialogHeader>
          <blockquote className="border-l-2 pl-4 text-sm leading-7 whitespace-pre-wrap">
            {citation?.quote}
          </blockquote>
        </DialogContent>
      </Dialog>
    </div>
  )
}
