"use client"

import { lazy, Suspense, useRef, useState } from "react"
import { Download, EditPencil, NavArrowLeft } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import type {
  StudyOutputArtifact,
  StudyOutputCitation,
  StudyOutputContent,
} from "@/lib/study-output-types"
import { StudyOutputGraph, StudyOutputTimeline } from "./study-output-diagram"
import { StudyOutputInteractive } from "./study-output-interactive"
import { StudyOutputMedia } from "./study-output-media"
import { StudyOutputSources } from "./study-output-citations"
import {
  exportStudyChart,
  exportStudyDiagram,
  exportStudyOutput,
} from "./study-output-export"
import { studyOutputTool } from "./study-output-catalog"
import { StudyOutputEditor } from "./study-output-editor"
import type { StudySetDetail } from "./study-tools-types"
import { ShareOutputAction } from "./sharing-dialog"

const StudyOutputChart = lazy(() =>
  import("./study-output-chart").then((module) => ({
    default: module.StudyOutputChart,
  }))
)

export function StudyOutputView({
  output,
  studySetId,
  versionId,
  revision,
  version,
  artifact,
  onBack,
  onRenew,
  onCitation,
  onChanged,
}: {
  output: StudyOutputContent
  studySetId: string
  versionId: string
  revision: number
  version: number
  artifact?: StudyOutputArtifact
  onBack: () => void
  onRenew: () => Promise<StudyOutputArtifact | undefined>
  onCitation: (citation: StudyOutputCitation) => void
  onChanged: (detail: StudySetDetail) => void
}) {
  const canvas = useRef<HTMLDivElement>(null)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState(false)
  const tool = studyOutputTool(output.kind)

  function exportDiagram() {
    const svg = canvas.current?.querySelector("svg")
    if (!svg) {
      setError("The diagram is still loading. Try exporting it again.")
      return
    }
    setError("")
    exportStudyDiagram(output.title, svg)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onBack}
        >
          <NavArrowLeft aria-hidden="true" /> Back
        </Button>
        <div className="ml-auto flex flex-wrap gap-1">
          <ShareOutputAction studySetId={studySetId} versionId={versionId} />
          {output.kind !== "podcast" && output.kind !== "video" && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setEditing(true)}
            >
              <EditPencil aria-hidden="true" /> Edit
            </Button>
          )}
          {(output.kind === "mind-map" || output.kind === "flowchart") && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={exportDiagram}
            >
              <Download aria-hidden="true" /> SVG
            </Button>
          )}
          {(output.kind === "bar-chart" || output.kind === "line-chart") && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => exportStudyChart(output)}
            >
              <Download aria-hidden="true" /> CSV
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => exportStudyOutput(output)}
          >
            <Download aria-hidden="true" /> Export JSON
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{tool.title}</Badge>
        </div>
        <h2 className="text-xl font-medium tracking-tight">{output.title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {output.description}
        </p>
      </header>
      <div ref={canvas} className="min-w-0">
        {output.kind === "mind-map" || output.kind === "flowchart" ? (
          <StudyOutputGraph output={output} onCitation={onCitation} />
        ) : output.kind === "timeline" ? (
          <StudyOutputTimeline output={output} onCitation={onCitation} />
        ) : output.kind === "bar-chart" || output.kind === "line-chart" ? (
          <Suspense
            fallback={
              <Skeleton
                className="h-80 w-full rounded-xl"
                aria-label="Loading chart"
              />
            }
          >
            <StudyOutputChart output={output} onCitation={onCitation} />
          </Suspense>
        ) : output.kind === "interactive" ? (
          <StudyOutputInteractive
            key={`${version}:${output.title}`}
            output={output}
            onCitation={onCitation}
          />
        ) : output.kind === "podcast" || output.kind === "video" ? (
          <StudyOutputMedia
            output={output}
            artifact={artifact}
            onRenew={onRenew}
            onCitation={onCitation}
          />
        ) : null}
      </div>
      <StudyOutputSources
        citations={output.citations}
        onCitation={onCitation}
      />
      {editing && output.kind !== "podcast" && output.kind !== "video" && (
        <StudyOutputEditor
          key={versionId}
          output={output}
          studySetId={studySetId}
          versionId={versionId}
          revision={revision}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false)
            onChanged(next)
          }}
        />
      )}
    </div>
  )
}
