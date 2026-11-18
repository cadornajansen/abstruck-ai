"use client"

import {
  CheckCircle,
  CloudUpload,
  Page,
  Refresh,
  WarningTriangle,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

export type ProcessingState =
  | "uploading"
  | "queued"
  | "processing"
  | "partial"
  | "failed"
  | "interrupted"
  | "quota"
  | "ready"
const copy: Record<ProcessingState, { title: string; description: string }> = {
  uploading: {
    title: "Uploading your material",
    description: "Keep this tab open while your file uploads.",
  },
  queued: {
    title: "Your material is in line",
    description:
      "We’ll start preparing it shortly. You can leave this page and come back.",
  },
  processing: {
    title: "Getting your material ready",
    description: "We’re reading your content and preparing it for study.",
  },
  partial: {
    title: "Some pages need your attention",
    description:
      "We could read part of this material, but one page was unclear.",
  },
  failed: {
    title: "We couldn’t read this file",
    description:
      "The file may be damaged or password protected. Try an unlocked copy, or choose another file.",
  },
  interrupted: {
    title: "Your upload was interrupted",
    description:
      "Your progress is still here. Reconnect and resume with the same file.",
  },
  quota: {
    title: "You’ve reached your import allowance",
    description:
      "Your saved materials are still available. Check your usage or choose a plan with more room.",
  },
  ready: {
    title: "Ready to learn",
    description:
      "Your material is prepared. Open it to explore, ask questions and practise.",
  },
}

export function ProcessingView({
  state,
  onRetry,
  onOpen,
  onReplace,
}: {
  state: ProcessingState
  onRetry: () => void
  onOpen: () => void
  onReplace: () => void
}) {
  const detail = copy[state]
  const issue = ["failed", "interrupted", "partial", "quota"].includes(state)
  return (
    <main
      id="main-content"
      className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-16 text-center"
    >
      <div className="grid size-16 place-items-center rounded-2xl bg-muted">
        {state === "ready" ? (
          <CheckCircle className="size-8 text-plan-foreground" />
        ) : issue ? (
          <WarningTriangle className="size-8 text-muted-foreground" />
        ) : state === "uploading" ? (
          <CloudUpload className="size-8" />
        ) : (
          <Spinner className="size-7" />
        )}
      </div>
      <div>
        <h1 className="text-2xl">{detail.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {detail.description}
        </p>
      </div>
      <div className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left">
        <Page className="size-6 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm">Greenhouse study notes.pdf</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Synthetic processing-state preview
          </p>
        </div>
      </div>
      {(state === "uploading" || state === "interrupted") && (
        <Progress value={42} className="w-full">
          <ProgressLabel>Uploaded</ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
      {["queued", "processing", "ready"].includes(state) && (
        <ol className="flex w-full flex-col gap-4 rounded-2xl border p-5 text-left text-sm">
          {[
            "Uploaded securely",
            "Reading your material",
            "Preparing your study workspace",
          ].map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <CheckCircle
                className={cn(
                  "size-5",
                  index === 0 || state === "ready"
                    ? "text-plan-foreground"
                    : "text-muted-foreground"
                )}
              />
              {step}
            </li>
          ))}
        </ol>
      )}
      {state === "partial" && (
        <Alert>
          <AlertTitle>Page 2 could not be read reliably</AlertTitle>
          <AlertDescription>
            Review those pages before relying on generated answers. You can use
            the readable pages or replace the source with a clearer copy.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {state === "ready" || state === "partial" ? (
          <Button onClick={onOpen}>
            {state === "partial" ? "Review usable content" : "Open material"}
          </Button>
        ) : ["failed", "interrupted"].includes(state) ? (
          <Button onClick={onRetry}>
            <Refresh data-icon="inline-start" />
            {state === "interrupted" ? "Resume upload" : "Try again"}
          </Button>
        ) : null}
        {issue && (
          <Button variant="outline" onClick={onReplace}>
            {state === "quota" ? "Back to library" : "Choose another file"}
          </Button>
        )}
      </div>
    </main>
  )
}
