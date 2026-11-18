"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  AnnotationActions,
  AnnotationComment,
  AnnotationPanel,
} from "./pdf-annotations"
import {
  annotationLimits,
  type AnnotationColor,
  type MaterialAnnotation,
  type MaterialAnnotationList,
  type MaterialAnnotationResult,
  type TimeHighlightLocator,
} from "@/lib/annotation-types"
import type { TranscriptSegment } from "./media-source-view"

export interface MediaAnnotationContext {
  materialId: string
  extractionVersion: number
}
type TimeAnnotation = MaterialAnnotation<TimeHighlightLocator>
interface Failure {
  error?: string
  annotation?: TimeAnnotation
  currentExtractionVersion?: number
}
class AnnotationFailure extends Error {
  constructor(readonly detail: Failure) {
    super(
      detail.error ??
        "The annotation could not be saved. Keep your note and try again."
    )
  }
}
async function annotationRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = await response.json()
  if (!response.ok) throw new AnnotationFailure(data as Failure)
  return data as T
}

export const mediaAnnotationSurfaces: Record<AnnotationColor, string> = {
  yellow: "bg-annotation-yellow/25",
  green: "bg-annotation-green/25",
  blue: "bg-annotation-blue/25",
  red: "bg-annotation-red/25",
}

export function useMediaAnnotations(context?: MediaAnnotationContext) {
  const path = context
    ? `/api/materials/${context.materialId}/annotations`
    : null
  const extractionVersion = context?.extractionVersion ?? 1
  const [annotations, setAnnotations] = useState<TimeAnnotation[]>([])
  const [currentVersion, setCurrentVersion] = useState(extractionVersion)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comment, setComment] = useState(false)
  const [commentRevision, setCommentRevision] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<TimeAnnotation | null>(null)
  const [retrySegment, setRetrySegment] = useState<TranscriptSegment | null>(
    null
  )
  const saving = useRef(false)
  const creationIds = useRef(new Map<string, string>())
  const selected = annotations.find((item) => item.id === selectedId)
  const sourceChanged = currentVersion !== extractionVersion
  const stale =
    !!selected &&
    (selected.extractionVersion !== extractionVersion || sourceChanged)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!path) return
      setLoading(true)
      setLoadError(null)
      try {
        const result = await annotationRequest<
          MaterialAnnotationList<TimeHighlightLocator>
        >(path, { signal })
        if (signal?.aborted) return
        setAnnotations(
          result.annotations.filter((item) => item.locator.type === "time")
        )
        setCurrentVersion(result.currentExtractionVersion)
      } catch {
        if (!signal?.aborted)
          setLoadError("Annotations could not be loaded. Try again.")
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [path]
  )
  useEffect(() => {
    setAnnotations([])
    setSelectedId(null)
    setError(null)
    setConflict(null)
    setComment(false)
    setCurrentVersion(extractionVersion)
    creationIds.current.clear()
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, extractionVersion])

  function replace(annotation: TimeAnnotation) {
    setAnnotations((items) =>
      items.some((item) => item.id === annotation.id)
        ? items.map((item) => (item.id === annotation.id ? annotation : item))
        : [...items, annotation]
    )
  }
  function failed(cause: unknown) {
    setError(
      cause instanceof AnnotationFailure
        ? cause.message
        : "We couldn’t connect. Your note is kept; try again."
    )
    if (cause instanceof AnnotationFailure) {
      setConflict(cause.detail.annotation ?? null)
      if (cause.detail.currentExtractionVersion !== undefined)
        setCurrentVersion(cause.detail.currentExtractionVersion)
    }
  }
  function select(annotation: TimeAnnotation) {
    if (saving.current) return
    setSelectedId(annotation.id)
    setComment(false)
    setError(null)
    setConflict(null)
    setRetrySegment(null)
    setOpen(true)
  }
  async function highlight(segment: TranscriptSegment) {
    if (!path || saving.current || sourceChanged) return
    const existing = annotations.find(
      (item) =>
        item.extractionVersion === extractionVersion &&
        item.locator.segmentId === segment.id
    )
    if (existing) {
      select(existing)
      return
    }
    const quote = segment.text
      .trim()
      .slice(0, annotationLimits.quote)
      .replace(/[\uD800-\uDBFF]$/, "")
    if (!quote) return
    const id = creationIds.current.get(segment.id) ?? crypto.randomUUID()
    creationIds.current.set(segment.id, id)
    saving.current = true
    setBusyId(id)
    setOpen(true)
    setSelectedId(null)
    setComment(false)
    setError(null)
    setConflict(null)
    try {
      const result = await annotationRequest<
        MaterialAnnotationResult<TimeHighlightLocator>
      >(path, {
        method: "POST",
        body: JSON.stringify({
          id,
          extractionVersion,
          locator: {
            type: "time",
            segmentId: segment.id,
            startMs: segment.startMs,
            endMs: segment.endMs,
            quote,
          },
          body: "",
          color: "yellow",
        }),
      })
      replace(result.annotation)
      setSelectedId(result.annotation.id)
      setCurrentVersion(result.currentExtractionVersion)
      setComment(false)
      setRetrySegment(null)
      creationIds.current.delete(segment.id)
    } catch (cause) {
      setRetrySegment(segment)
      failed(cause)
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }
  async function update(body: string, color: AnnotationColor) {
    if (!path || !selected || saving.current || stale || conflict) return
    saving.current = true
    setBusyId(selected.id)
    setError(null)
    try {
      const result = await annotationRequest<
        MaterialAnnotationResult<TimeHighlightLocator>
      >(`${path}/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          extractionVersion: selected.extractionVersion,
          revision: selected.revision,
          body,
          color,
        }),
      })
      replace(result.annotation)
      setComment(false)
    } catch (cause) {
      failed(cause)
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }
  async function remove() {
    if (!path || !selected || saving.current) return
    saving.current = true
    setBusyId(selected.id)
    setError(null)
    try {
      await annotationRequest(`${path}/${selected.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          extractionVersion: selected.extractionVersion,
          revision: selected.revision,
        }),
      })
      setAnnotations((items) => items.filter((item) => item.id !== selected.id))
      setSelectedId(null)
      setConflict(null)
      setComment(false)
    } catch (cause) {
      failed(cause)
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }
  function loadLatest() {
    if (!conflict || saving.current) return
    replace(conflict)
    setConflict(null)
    setError(null)
    setCommentRevision((value) => value + 1)
  }
  return {
    annotations,
    currentVersion,
    extractionVersion,
    loading,
    loadError,
    error,
    open,
    selected,
    stale,
    sourceChanged,
    comment,
    commentRevision,
    busyId,
    conflict,
    retrySegment,
    setComment,
    select,
    highlight,
    update,
    remove,
    loadLatest,
    retryLoad: () => void load(),
    setOpen: (value: boolean) => {
      if (!saving.current) setOpen(value)
    },
  }
}

type AnnotationState = ReturnType<typeof useMediaAnnotations>
export function MediaAnnotationRail({
  state,
  compact,
  onSeek,
  onRefreshSource,
}: {
  state: AnnotationState
  compact: boolean
  onSeek: (timeMs: number) => void
  onRefreshSource?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const selected = state.selected
  const content = (
    <>
      <AnnotationPanel
        mode="time"
        annotations={state.annotations}
        currentVersion={state.currentVersion}
        loading={state.loading}
        error={state.loadError}
        busyId={state.busyId}
        autoHighlight={false}
        onAutoHighlightChange={() => {}}
        onClose={() => state.setOpen(false)}
        onRetry={state.retryLoad}
        onSelect={(annotation) => {
          if (state.busyId) return
          state.select(annotation)
          if (
            annotation.extractionVersion === state.extractionVersion &&
            !state.sourceChanged
          )
            onSeek(annotation.locator.startMs)
        }}
        className="min-h-24 w-full flex-1 border-r-0"
      />
      {state.sourceChanged && (
        <Alert>
          <AlertDescription>
            The source version changed. Refresh before adding annotations.
            {onRefreshSource && (
              <Button size="sm" variant="outline" onClick={onRefreshSource}>
                Refresh source
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {state.error && !state.comment && (
        <Alert variant="destructive">
          <AlertDescription>
            {state.error}
            {state.retrySegment && !state.sourceChanged && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void state.highlight(state.retrySegment!)}
                disabled={!!state.busyId}
              >
                Retry highlight
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {selected && (
        <section
          aria-label="Selected annotation"
          className="max-h-[55svh] shrink-0 overflow-y-auto border-t p-2"
        >
          {state.stale ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Earlier source version. You can inspect or delete this
                annotation; it will not seek or highlight the current source.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!!state.busyId}
                onClick={() => void state.remove()}
              >
                Delete annotation
              </Button>
            </div>
          ) : state.comment ? (
            <AnnotationComment
              key={`${selected.id}:${state.commentRevision}`}
              initialBody={selected.body}
              busy={!!state.busyId}
              error={state.error}
              saveDisabled={!!state.conflict || state.sourceChanged}
              onSave={(body) => void state.update(body, selected.color)}
              onCancel={() => state.setComment(false)}
            />
          ) : (
            <AnnotationActions
              annotation={selected}
              busy={!!state.busyId}
              onColorChange={(color) => void state.update(selected.body, color)}
              onComment={() => state.setComment(true)}
              onDelete={() => void state.remove()}
              onClose={() => state.setOpen(false)}
            />
          )}
          {state.conflict && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                Latest saved note: {state.conflict.body || "No comment"}
              </p>
              <Button variant="outline" size="sm" onClick={state.loadLatest}>
                Load latest (replaces this draft)
              </Button>
            </div>
          )}
        </section>
      )}
    </>
  )
  if (compact)
    return (
      <Dialog open={state.open} onOpenChange={state.setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(80svh,40rem)] flex-col gap-0 overflow-hidden p-0"
        >
          <DialogTitle className="sr-only">Media annotations</DialogTitle>
          {content}
        </DialogContent>
      </Dialog>
    )
  return (
    <AnimatePresence initial={false}>
      {state.open && (
        <motion.div
          key="media-annotations"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r bg-background"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
