"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import { EditPencil, Notes } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
} from "@workspace/ui/components/popover"
import {
  AnnotationActions,
  AnnotationComment,
  AnnotationPanel,
} from "./pdf-annotations"
import { PdfPageView, type PdfTextSelection } from "./pdf-page-view"
import { studyError } from "./study-tools-types"
import type {
  AnnotationColor,
  MaterialAnnotation,
  MaterialAnnotationList,
  MaterialAnnotationResult,
} from "@/lib/annotation-types"

type AnnotationPopup =
  | { kind: "selection"; selection: PdfTextSelection; id: string }
  | { kind: "annotation" | "comment"; id: string; anchor: HTMLElement }

interface AnnotationFailure {
  error?: string
  code?: string
  annotation?: MaterialAnnotation
  currentExtractionVersion?: number
}

class AnnotationRequestError extends Error {
  constructor(readonly detail: AnnotationFailure) {
    super(
      detail.error || "Your annotation could not be saved. Please try again."
    )
  }
}

async function annotationRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  })
  const body: T & AnnotationFailure = await response.json()
  if (!response.ok) throw new AnnotationRequestError(body)
  return body
}

export function AnnotatedPdfView({
  materialId,
  extractionVersion,
  annotationsOpen,
  onCloseAnnotations,
  onRefreshSource,
  onCreateNote,
  ...viewerProps
}: Omit<
  ComponentProps<typeof PdfPageView>,
  | "annotations"
  | "activeAnnotationId"
  | "focusAnnotation"
  | "onSelectText"
  | "onSelectionError"
  | "onSelectionClear"
  | "onOpenAnnotation"
> & {
  materialId: string
  extractionVersion: number
  annotationsOpen: boolean
  onCloseAnnotations: () => void
  onRefreshSource?: () => void
  onCreateNote?: (selection: PdfTextSelection) => Promise<void>
}) {
  const path = `/api/materials/${materialId}/annotations`
  const [annotations, setAnnotations] = useState<MaterialAnnotation[]>([])
  const [currentVersion, setCurrentVersion] = useState(extractionVersion)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<MaterialAnnotation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [autoHighlight, setAutoHighlight] = useState(false)
  const [popup, setPopup] = useState<AnnotationPopup | null>(null)
  const [focusAnnotation, setFocusAnnotation] = useState<{
    id: string
    requestId: string
  } | null>(null)
  const saving = useRef(false)
  const selectionSignature = useRef("")
  const reducedMotion = useReducedMotion()

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await annotationRequest<MaterialAnnotationList>(path, {
          signal,
        })
        if (signal?.aborted) return
        setAnnotations(data.annotations)
        setCurrentVersion(data.currentExtractionVersion)
      } catch (cause) {
        if (signal?.aborted) return
        setLoadError(
          cause instanceof AnnotationRequestError
            ? cause.message
            : "Annotations could not be loaded. Try again."
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [path]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const currentAnnotations = useMemo(
    () =>
      annotations.filter(
        (item) => item.extractionVersion === extractionVersion
      ),
    [annotations, extractionVersion]
  )
  const selected =
    popup && popup.kind !== "selection"
      ? annotations.find((item) => item.id === popup.id)
      : undefined
  const sourceChanged = currentVersion !== extractionVersion
  const popupAnchor = useMemo(() => {
    if (!popup) return undefined
    if (popup.kind !== "selection") return popup.anchor
    const { anchor, contextElement } = popup.selection
    return { getBoundingClientRect: () => anchor, contextElement }
  }, [popup])

  function closePopup() {
    if (saving.current) return
    if (popup?.kind === "selection") {
      selectionSignature.current = ""
      window.getSelection()?.removeAllRanges()
    }
    setPopup(null)
    setFocusAnnotation(null)
    setOperationError(null)
    setConflict(null)
  }

  function replaceAnnotation(annotation: MaterialAnnotation) {
    setAnnotations((items) => {
      const existing = items.some((item) => item.id === annotation.id)
      return existing
        ? items.map((item) => (item.id === annotation.id ? annotation : item))
        : [...items, annotation]
    })
  }

  function failed(cause: unknown) {
    setOperationError(
      cause instanceof AnnotationRequestError
        ? cause.message
        : "We couldn’t connect. Your selection or comment is kept; try again."
    )
    if (cause instanceof AnnotationRequestError) {
      setConflict(cause.detail.annotation ?? null)
      if (cause.detail.currentExtractionVersion !== undefined)
        setCurrentVersion(cause.detail.currentExtractionVersion)
    }
  }

  async function createHighlight(selection: PdfTextSelection, id: string) {
    if (saving.current || sourceChanged) return
    saving.current = true
    setBusyId(id)
    setOperationError(null)
    setConflict(null)
    try {
      const result = await annotationRequest<MaterialAnnotationResult>(path, {
        method: "POST",
        body: JSON.stringify({
          id,
          extractionVersion,
          locator: selection.locator,
          color: "yellow",
        }),
      })
      replaceAnnotation(result.annotation)
      window.getSelection()?.removeAllRanges()
      setPopup(null)
      setFocusAnnotation({
        id: result.annotation.id,
        requestId: crypto.randomUUID(),
      })
    } catch (cause) {
      failed(cause)
      setPopup({ kind: "selection", selection, id })
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }

  async function createNote(selection: PdfTextSelection) {
    if (!onCreateNote || saving.current || sourceChanged) return
    saving.current = true
    setBusyId("create-note")
    setOperationError(null)
    try {
      await onCreateNote(selection)
      window.getSelection()?.removeAllRanges()
      selectionSignature.current = ""
      setPopup(null)
    } catch (cause) {
      setOperationError(studyError(cause))
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }

  async function editAnnotation(
    annotation: MaterialAnnotation,
    body: string,
    color: AnnotationColor
  ) {
    if (saving.current || sourceChanged || conflict) return
    saving.current = true
    setBusyId(annotation.id)
    setOperationError(null)
    try {
      const result = await annotationRequest<MaterialAnnotationResult>(
        `${path}/${annotation.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            revision: annotation.revision,
            extractionVersion: annotation.extractionVersion,
            body,
            color,
          }),
        }
      )
      replaceAnnotation(result.annotation)
      setPopup((previous) =>
        previous && previous.kind !== "selection"
          ? { ...previous, kind: "annotation" }
          : previous
      )
    } catch (cause) {
      failed(cause)
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }

  async function deleteAnnotation(annotation: MaterialAnnotation) {
    if (saving.current || conflict) return
    saving.current = true
    setBusyId(annotation.id)
    setOperationError(null)
    try {
      await annotationRequest(`${path}/${annotation.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          revision: annotation.revision,
          extractionVersion: annotation.extractionVersion,
        }),
      })
      setAnnotations((items) =>
        items.filter((item) => item.id !== annotation.id)
      )
      setPopup(null)
      setFocusAnnotation(null)
    } catch (cause) {
      failed(cause)
    } finally {
      saving.current = false
      setBusyId(null)
    }
  }

  function selectAnnotation(annotation: MaterialAnnotation) {
    setOperationError(null)
    setConflict(null)
    const row = document.getElementById(`annotation-${annotation.id}`)
    if (row) setPopup({ kind: "annotation", id: annotation.id, anchor: row })
    if (annotation.extractionVersion !== extractionVersion) {
      // Old source anchors remain inspectable, but must never be drawn on this PDF.
      setPopup({
        kind: "annotation",
        id: annotation.id,
        anchor:
          document.getElementById(`annotation-${annotation.id}`) ??
          document.body,
      })
    } else
      setFocusAnnotation({ id: annotation.id, requestId: crypto.randomUUID() })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <motion.div
          initial={false}
          animate={{
            width: annotationsOpen ? 256 : 0,
            opacity: annotationsOpen ? 1 : 0,
          }}
          transition={{
            duration: reducedMotion ? 0 : 0.18,
            ease: [0.22, 1, 0.36, 1],
          }}
          inert={!annotationsOpen}
          aria-hidden={!annotationsOpen}
          className="shrink-0 overflow-hidden max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:z-20 max-sm:shadow-md"
        >
          <AnnotationPanel
            annotations={annotations}
            currentVersion={extractionVersion}
            loading={loading}
            error={loadError}
            busyId={busyId}
            autoHighlight={autoHighlight}
            onAutoHighlightChange={setAutoHighlight}
            onClose={onCloseAnnotations}
            onSelect={selectAnnotation}
            onRetry={() => void load()}
          />
        </motion.div>
        <PdfPageView
          {...viewerProps}
          annotations={currentAnnotations}
          activeAnnotationId={selected?.id}
          focusAnnotation={focusAnnotation}
          onOpenAnnotation={(id, anchor) => {
            setPopup((previous) =>
              previous?.id === id && previous.kind !== "selection"
                ? previous.anchor === anchor
                  ? previous
                  : { ...previous, anchor }
                : { kind: "annotation", id, anchor }
            )
          }}
          onSelectText={(selection) => {
            if (loading || loadError || sourceChanged || saving.current) return
            const signature = JSON.stringify(selection.locator)
            if (selectionSignature.current === signature) return
            selectionSignature.current = signature
            setOperationError(null)
            setConflict(null)
            const id = crypto.randomUUID()
            setPopup({ kind: "selection", selection, id })
            if (autoHighlight) void createHighlight(selection, id)
          }}
          onSelectionClear={() => {
            selectionSignature.current = ""
            setPopup((previous) =>
              previous?.kind === "selection" && !saving.current
                ? null
                : previous
            )
          }}
          onSelectionError={setOperationError}
        />
      </div>
      {sourceChanged && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground"
        >
          This source has changed. Refresh before adding or editing highlights.
          <Button size="sm" variant="ghost" onClick={onRefreshSource}>
            Refresh source
          </Button>
        </div>
      )}
      {operationError && !popup && (
        <p
          role="alert"
          className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground"
        >
          {operationError}
        </p>
      )}
      <Popover
        open={!!popup}
        onOpenChange={(open) => {
          if (!open && popup?.kind !== "comment") closePopup()
        }}
      >
        <PopoverContent
          anchor={popupAnchor}
          side={popup?.kind === "selection" ? "top" : "bottom"}
          align="center"
          initialFocus={false}
          finalFocus={false}
          className="w-auto max-w-[min(22rem,calc(100vw-2rem))] gap-1 rounded-xl p-1.5"
        >
          <PopoverTitle className="sr-only">
            {popup?.kind === "selection" ? "Selected passage" : "Highlight"}
          </PopoverTitle>
          {popup?.kind === "selection" ? (
            <div className="flex items-center gap-0.5">
              {onCreateNote && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busyId || sourceChanged}
                  onClick={() => void createNote(popup.selection)}
                >
                  <Notes data-icon="inline-start" />
                  {busyId === "create-note" ? "Saving…" : "Create note"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busyId || sourceChanged}
                onClick={() => void createHighlight(popup.selection, popup.id)}
              >
                <EditPencil data-icon="inline-start" />
                {busyId === popup.id ? "Saving…" : "Highlight"}
              </Button>
            </div>
          ) : selected && popup?.kind === "comment" ? (
            <AnnotationComment
              key={`${selected.id}:${selected.revision}`}
              initialBody={selected.body}
              busy={!!busyId}
              saveDisabled={!!conflict || sourceChanged}
              error={operationError}
              onSave={(body) =>
                void editAnnotation(selected, body, selected.color)
              }
              onCancel={closePopup}
            />
          ) : selected && selected.extractionVersion !== extractionVersion ? (
            <div className="flex w-64 flex-col gap-2 p-2">
              <p className="text-xs text-muted-foreground">
                Earlier PDF version · page {selected.locator.page}
              </p>
              <p className="text-sm">{selected.locator.quote}</p>
              {selected.body && (
                <p className="text-sm text-muted-foreground">{selected.body}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busyId || !!conflict}
                onClick={() => void deleteAnnotation(selected)}
              >
                Delete highlight
              </Button>
            </div>
          ) : selected ? (
            <AnnotationActions
              annotation={selected}
              busy={!!busyId || sourceChanged || !!conflict}
              onColorChange={(color) =>
                void editAnnotation(selected, selected.body, color)
              }
              onComment={() =>
                setPopup((previous) =>
                  previous && previous.kind !== "selection"
                    ? { ...previous, kind: "comment" }
                    : previous
                )
              }
              onDelete={() => void deleteAnnotation(selected)}
              onClose={closePopup}
            />
          ) : null}
          {operationError && popup?.kind !== "comment" && (
            <p
              role="alert"
              className="max-w-72 px-2 py-1 text-xs text-destructive"
            >
              {operationError}
            </p>
          )}
          {conflict && (
            <div className="flex max-w-72 flex-col gap-2 border-t p-2 text-xs text-muted-foreground">
              {conflict.body && <p>Latest saved comment: {conflict.body}</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  replaceAnnotation(conflict)
                  setConflict(null)
                  setOperationError(null)
                }}
              >
                Load latest (replaces this draft)
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
