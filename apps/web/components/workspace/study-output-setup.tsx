"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  STUDY_OUTPUT_LIMITS,
  type StudyOutputType,
} from "@/lib/study-output-types"
import { studyOutputTool } from "./study-output-catalog"
import { studyError, studyRequest } from "./study-tools-types"

interface GenerationCapabilities {
  tools: { type: string; available: boolean; reason: string | null }[]
}

export function StudyOutputSetup({
  type,
  materialId,
  sourceIds,
  conversationId,
  canGenerate,
  onClose,
  onCreated,
}: {
  type: StudyOutputType
  materialId: string
  sourceIds: string[]
  conversationId?: string | null
  canGenerate: boolean
  onClose: () => void
  onCreated: (studySetId: string) => void
}) {
  const id = useId()
  const tool = studyOutputTool(type)
  const limits = STUDY_OUTPUT_LIMITS[type]
  const [count, setCount] = useState(limits.defaultCount)
  const [pageStart, setPageStart] = useState("")
  const [pageEnd, setPageEnd] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [capabilities, setCapabilities] =
    useState<GenerationCapabilities | null>(null)
  const [capabilityError, setCapabilityError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const requestId = useRef<string | null>(null)
  const conversationBasis = sourceIds.length === 0
  const available = capabilities?.tools.find(
    (candidate) => candidate.type === type
  )
  const invalidRange =
    [pageStart, pageEnd].some(
      (value) =>
        value &&
        (!Number.isInteger(Number(value)) ||
          Number(value) < 1 ||
          Number(value) > 200)
    ) ||
    (!!pageStart && !!pageEnd && Number(pageEnd) < Number(pageStart))
  const invalidCount =
    !Number.isInteger(count) ||
    count < limits.minCount ||
    count > limits.maxCount

  useEffect(() => {
    const controller = new AbortController()
    setCapabilityError("")
    setCapabilities(null)
    studyRequest<GenerationCapabilities>(
      `/api/materials/${materialId}/study-sets/generate`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (!controller.signal.aborted) setCapabilities(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setCapabilityError(studyError(cause))
      })
    return () => controller.abort()
  }, [materialId, refresh])

  function settingsChanged() {
    requestId.current = null
    setError("")
  }

  async function generate() {
    if (
      creating ||
      !canGenerate ||
      !available?.available ||
      invalidRange ||
      invalidCount
    )
      return
    setCreating(true)
    setError("")
    requestId.current ??= crypto.randomUUID()
    try {
      const result = await studyRequest<{ studySetId: string }>(
        `/api/materials/${materialId}/study-sets/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            type,
            count,
            sourceIds,
            ...(conversationId ? { conversationId } : {}),
            ...(!conversationBasis && pageStart
              ? { pageStart: Number(pageStart) }
              : {}),
            ...(!conversationBasis && pageEnd
              ? { pageEnd: Number(pageEnd) }
              : {}),
            requestId: requestId.current,
          }),
        }
      )
      onCreated(result.studySetId)
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !creating) onClose()
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[12px] p-6 sm:max-w-xl"
        showCloseButton={!creating}
      >
        <DialogHeader className="gap-2 pr-5">
          <DialogTitle className="text-lg leading-6">
            Generate {tool.title}
          </DialogTitle>
          <DialogDescription>{tool.detail}</DialogDescription>
        </DialogHeader>
        <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          {conversationBasis
            ? "Based on the recent saved conversation. No material citations will be added."
            : `Based on ${sourceIds.length} selected material${sourceIds.length === 1 ? "" : "s"}. Source references are saved with the output.`}
        </p>
        <FieldSet disabled={creating}>
          <FieldGroup>
            {(type === "podcast" || type === "video") && (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-2">
                  <dt className="font-medium">Voice</dt>
                  <dd className="py-1.5 text-muted-foreground">
                    Jane · AI voice
                  </dd>
                </div>
                <div className="flex flex-col gap-2">
                  <dt className="font-medium">Length</dt>
                  <dd className="w-fit rounded-full bg-muted px-3 py-1.5">
                    Short
                  </dd>
                </div>
              </dl>
            )}
            {limits.minCount !== limits.maxCount && (
              <Field data-invalid={invalidCount}>
                <FieldLabel htmlFor={`${id}-count`}>
                  Maximum {tool.countLabel.toLowerCase()}
                </FieldLabel>
                <Input
                  id={`${id}-count`}
                  type="number"
                  min={limits.minCount}
                  max={limits.maxCount}
                  step={1}
                  value={count}
                  aria-invalid={invalidCount}
                  onChange={(event) => {
                    setCount(Number(event.target.value))
                    settingsChanged()
                  }}
                />
                <FieldDescription>
                  {limits.minCount}–{limits.maxCount}. The result may contain
                  fewer when the input supports less.
                </FieldDescription>
              </Field>
            )}
            {!conversationBasis && type !== "podcast" && type !== "video" && (
              <div className="grid grid-cols-2 gap-3">
                <Field data-invalid={invalidRange}>
                  <FieldLabel htmlFor={`${id}-start`}>
                    From page (optional)
                  </FieldLabel>
                  <Input
                    id={`${id}-start`}
                    type="number"
                    min={1}
                    max={200}
                    value={pageStart}
                    aria-invalid={invalidRange}
                    onChange={(event) => {
                      setPageStart(event.target.value)
                      settingsChanged()
                    }}
                  />
                </Field>
                <Field data-invalid={invalidRange}>
                  <FieldLabel htmlFor={`${id}-end`}>
                    To page (optional)
                  </FieldLabel>
                  <Input
                    id={`${id}-end`}
                    type="number"
                    min={1}
                    max={200}
                    value={pageEnd}
                    aria-invalid={invalidRange}
                    onChange={(event) => {
                      setPageEnd(event.target.value)
                      settingsChanged()
                    }}
                  />
                </Field>
              </div>
            )}
          </FieldGroup>
        </FieldSet>
        {(type === "podcast" || type === "video") && (
          <p className="text-xs leading-5 text-muted-foreground">
            Creates a short AI-narrated{" "}
            {type === "podcast" ? "audio file" : "slide video"}. Playback and
            the saved script are available after generation. Uses a fixed
            English voice. Voice and topic selection aren’t available yet.
          </p>
        )}
        {(type === "bar-chart" || type === "line-chart") && (
          <p className="text-xs leading-5 text-muted-foreground">
            Charts require numbers in the selected input. If no suitable data is
            present, generation will stop without inventing values.
          </p>
        )}
        {!canGenerate && (
          <Alert>
            <AlertDescription>
              {conversationBasis
                ? "Send a question and wait for a completed answer before generating from this conversation."
                : "Choose a ready material before generating."}
            </AlertDescription>
          </Alert>
        )}
        {invalidRange && (
          <p role="alert" className="text-sm text-destructive">
            Use pages 1–200, with the end after the start.
          </p>
        )}
        {capabilityError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {capabilityError}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-fit"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Check availability again
              </Button>
            </AlertDescription>
          </Alert>
        ) : !capabilities ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Checking availability…
          </p>
        ) : !available?.available ? (
          <Alert>
            <AlertDescription>
              {available?.reason ||
                "This tool isn’t available right now. Check again later."}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-fit"
                onClick={() => setRefresh((value) => value + 1)}
              >
                Check availability again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            disabled={creating}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="h-10 rounded-xl"
            disabled={
              creating ||
              !canGenerate ||
              !available?.available ||
              invalidRange ||
              invalidCount
            }
            onClick={() => void generate()}
          >
            {creating && <Spinner />}
            {creating ? "Creating…" : `Generate ${tool.title}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
