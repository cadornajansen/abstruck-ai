"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { PDFDocumentLoadingTask } from "pdfjs-dist"
import type { PDFViewer } from "pdfjs-dist/types/web/pdf_viewer"
import type { PDFPageView } from "pdfjs-dist/types/web/pdf_page_view"
import {
  annotationLimits,
  type MaterialAnnotation,
  type PdfHighlightLocator,
  type PdfHighlightRectangle,
} from "@/lib/annotation-types"
import { cn } from "@workspace/ui/lib/utils"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"

export interface PdfTextSelection {
  locator: PdfHighlightLocator
  anchor: DOMRect
  contextElement: HTMLElement
}

interface HighlightTarget {
  page: number
  host: HTMLDivElement
  viewport: PDFPageView["viewport"]
}

const highlightColors = {
  yellow: "bg-annotation-yellow/30",
  green: "bg-annotation-green/25",
  blue: "bg-annotation-blue/25",
  red: "bg-annotation-red/25",
} as const

function hasViewport(element: HTMLElement | null): boolean {
  return !!element && element.clientWidth > 0 && element.clientHeight > 0
}

function viewportRectangle(
  rect: PdfHighlightRectangle,
  viewport: PDFPageView["viewport"]
) {
  const [x0, y0, x1, y1] = viewport.viewBox as [number, number, number, number]
  const first = viewport.convertToViewportPoint(
    x0 + rect.x * (x1 - x0),
    y1 - rect.y * (y1 - y0)
  )
  const last = viewport.convertToViewportPoint(
    x0 + (rect.x + rect.width) * (x1 - x0),
    y1 - (rect.y + rect.height) * (y1 - y0)
  )
  return {
    left: `${(Math.min(first[0], last[0]) / viewport.width) * 100}%`,
    top: `${(Math.min(first[1], last[1]) / viewport.height) * 100}%`,
    width: `${(Math.abs(last[0] - first[0]) / viewport.width) * 100}%`,
    height: `${(Math.abs(last[1] - first[1]) / viewport.height) * 100}%`,
  }
}

export function PdfPageView({
  url,
  pageNumber,
  title,
  fitMode = "page",
  zoom,
  onPageChange,
  annotations = [],
  activeAnnotationId,
  focusAnnotation,
  onSelectText,
  onSelectionError,
  onSelectionClear,
  onOpenAnnotation,
}: {
  url: string
  pageNumber: number
  title: string
  fitMode?: "page" | "width"
  zoom?: number
  onPageChange?: (page: number) => void
  annotations?: MaterialAnnotation[]
  activeAnnotationId?: string
  focusAnnotation?: { id: string; requestId: string } | null
  onSelectText?: (selection: PdfTextSelection) => void
  onSelectionError?: (message: string) => void
  onSelectionClear?: () => void
  onOpenAnnotation?: (id: string, anchor: HTMLElement) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const viewerHost = useRef<HTMLDivElement>(null)
  const viewer = useRef<PDFViewer | null>(null)
  const initialized = useRef(false)
  const position = useRef<{ page: number; top: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [highlightTargets, setHighlightTargets] = useState<HighlightTarget[]>(
    []
  )

  const syncHighlights = useEffectEvent(() => {
    const current = viewer.current
    if (!current || !initialized.current) return
    const targets: HighlightTarget[] = []
    for (const page of new Set(annotations.map((item) => item.locator.page))) {
      const pageView = current.getPageView(page - 1) as PDFPageView | undefined
      if (!pageView?.viewport || !pageView.div.isConnected) continue
      let host = pageView.div.querySelector<HTMLDivElement>(
        ":scope > [data-abstruck-highlights]"
      )
      if (!host) {
        host = document.createElement("div")
        host.dataset.abstruckHighlights = "true"
        host.className = "pointer-events-none absolute inset-0 z-10"
        host.setAttribute("aria-hidden", "true")
        pageView.div.append(host)
      }
      targets.push({ page, host, viewport: pageView.viewport.clone() })
    }
    setHighlightTargets((previous) =>
      previous.length === targets.length &&
      previous.every((item, index) => {
        const next = targets[index]!
        return (
          item.host === next.host &&
          item.viewport.width === next.viewport.width &&
          item.viewport.height === next.viewport.height &&
          item.viewport.rotation === next.viewport.rotation
        )
      })
        ? previous
        : targets
    )
  })

  const clearSelection = useEffectEvent(() => onSelectionClear?.())
  const openAnnotation = useEffectEvent((id: string, anchor: HTMLElement) =>
    onOpenAnnotation?.(id, anchor)
  )
  function captureSelection(point?: { x: number; y: number }) {
    const current = viewer.current
    const scroller = container.current
    if (!initialized.current || !current || !scroller) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      onSelectionClear?.()
      if (point) {
        const hit = [
          ...scroller.querySelectorAll<HTMLElement>("[data-highlight-id]"),
        ].find((element) => {
          const rect = element.getBoundingClientRect()
          return (
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom
          )
        })
        if (hit?.dataset.highlightId)
          onOpenAnnotation?.(hit.dataset.highlightId, hit)
      }
      return
    }
    if (!onSelectText || selection.rangeCount !== 1) return
    const range = selection.getRangeAt(0)
    const start =
      range.startContainer.parentElement?.closest<HTMLElement>(".page")
    const end = range.endContainer.parentElement?.closest<HTMLElement>(".page")
    if (!start || !end || !scroller.contains(start) || !scroller.contains(end))
      return
    if (start !== end) {
      onSelectionError?.("Select a passage on one page to highlight it.")
      return
    }
    const quote = selection.toString().trim()
    if (quote.length > annotationLimits.quote) {
      onSelectionError?.("Select a shorter passage to highlight it.")
      return
    }
    const page = Number(start.dataset.pageNumber)
    const pageView = current.getPageView(page - 1) as PDFPageView | undefined
    if (!pageView?.viewport || !Number.isInteger(page)) return
    const viewport = pageView.viewport
    const bounds = start.getBoundingClientRect()
    const [x0, y0, x1, y1] = viewport.viewBox as [
      number,
      number,
      number,
      number,
    ]
    const rects: PdfHighlightRectangle[] = []
    const seen = new Set<string>()
    for (const rect of range.getClientRects()) {
      const left = Math.max(rect.left, bounds.left)
      const right = Math.min(rect.right, bounds.right)
      const top = Math.max(rect.top, bounds.top)
      const bottom = Math.min(rect.bottom, bounds.bottom)
      if (right - left < 0.5 || bottom - top < 0.5) continue
      const first = viewport.convertToPdfPoint(
        ((left - bounds.left) / bounds.width) * viewport.width,
        ((top - bounds.top) / bounds.height) * viewport.height
      )
      const last = viewport.convertToPdfPoint(
        ((right - bounds.left) / bounds.width) * viewport.width,
        ((bottom - bounds.top) / bounds.height) * viewport.height
      )
      const normalized = {
        x: Math.max(
          0,
          Math.min(1, (Math.min(first[0], last[0]) - x0) / (x1 - x0))
        ),
        y: Math.max(
          0,
          Math.min(1, (y1 - Math.max(first[1], last[1])) / (y1 - y0))
        ),
        width: Math.min(1, Math.abs(last[0] - first[0]) / (x1 - x0)),
        height: Math.min(1, Math.abs(last[1] - first[1]) / (y1 - y0)),
      }
      normalized.width = Math.min(normalized.width, 1 - normalized.x)
      normalized.height = Math.min(normalized.height, 1 - normalized.y)
      const key = Object.values(normalized)
        .map((value) => value.toFixed(6))
        .join(":")
      if (!seen.has(key) && normalized.width > 0 && normalized.height > 0) {
        seen.add(key)
        rects.push(normalized)
      }
    }
    if (!rects.length) return
    if (rects.length > annotationLimits.rectangles) {
      onSelectionError?.("Select a shorter passage to highlight it.")
      return
    }
    onSelectText({
      locator: { type: "page", page, rects, quote },
      anchor: range.getBoundingClientRect(),
      contextElement: scroller,
    })
  }

  const captureChangedSelection = useEffectEvent(() => {
    const scroller = container.current
    const selection = document.getSelection()
    if (!scroller || !selection) return
    if (
      !selection.isCollapsed &&
      (!scroller.contains(selection.anchorNode) ||
        !scroller.contains(selection.focusNode))
    )
      return
    captureSelection()
  })

  useEffect(() => {
    let timer: number | undefined
    let selecting = false

    function scheduleSelection() {
      window.clearTimeout(timer)
      if (selecting) return
      // Native touch handles and selection menus can update after pointerup.
      timer = window.setTimeout(captureChangedSelection, 150)
    }

    function startSelection(event: PointerEvent) {
      selecting =
        event.target instanceof Node &&
        !!container.current?.contains(event.target)
    }

    function finishSelection() {
      if (!selecting) return
      selecting = false
      scheduleSelection()
    }

    document.addEventListener("selectionchange", scheduleSelection)
    document.addEventListener("pointerdown", startSelection)
    document.addEventListener("pointerup", finishSelection)
    document.addEventListener("pointercancel", finishSelection)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("selectionchange", scheduleSelection)
      document.removeEventListener("pointerdown", startSelection)
      document.removeEventListener("pointerup", finishSelection)
      document.removeEventListener("pointercancel", finishSelection)
    }
  }, [])

  const applyScale = useEffectEvent((current: PDFViewer) => {
    if (zoom) current.currentScale = zoom
    else
      current.currentScaleValue = fitMode === "page" ? "page-fit" : "page-width"
  })
  const requestedPage = useEffectEvent(() => pageNumber)
  const reportPage = useEffectEvent((page: number) => onPageChange?.(page))

  useEffect(() => {
    const scroller = container.current
    const host = viewerHost.current
    if (!scroller || !host) return
    let disposed = false
    let task: PDFDocumentLoadingTask | undefined
    let current: PDFViewer | undefined
    let detachEvents: (() => void) | undefined
    initialized.current = false
    setLoading(true)
    setError("")

    function savePosition() {
      clearSelection()
      if (initialized.current && current && hasViewport(scroller))
        position.current = {
          page: current.currentPageNumber,
          top: scroller!.scrollTop,
        }
    }
    scroller.addEventListener("scroll", savePosition, { passive: true })
    const resize = new ResizeObserver(() => {
      if (!initialized.current || !current || !hasViewport(scroller)) return
      applyScale(current)
      if (current.currentPageNumber !== requestedPage())
        current.scrollPageIntoView({ pageNumber: requestedPage() })
      current.update()
      syncHighlights()
    })
    resize.observe(scroller)

    async function load() {
      try {
        // The viewer module reads pdfjsLib installed by the core module.
        const library = await import("pdfjs-dist")
        const { PDFViewer, EventBus, PDFLinkService } =
          await import("pdfjs-dist/web/pdf_viewer.mjs")
        if (disposed) return
        library.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.mjs?v=${library.version}`
        const eventBus = new EventBus()
        const linkService = new PDFLinkService({
          eventBus,
          ignoreDestinationZoom: true,
        })
        current = new PDFViewer({
          container: scroller!,
          viewer: host!,
          eventBus,
          linkService,
          removePageBorders: true,
          annotationMode: library.AnnotationMode.DISABLE,
          maxCanvasPixels: 8_388_608,
          enableAutoLinking: false,
        })
        viewer.current = current
        linkService.setViewer(current)

        const pagesReady = () => {
          if (disposed || !current) return
          if (hasViewport(scroller)) applyScale(current)
          const page = Math.min(
            Math.max(1, requestedPage()),
            current.pagesCount
          )
          if (hasViewport(scroller))
            current.scrollPageIntoView({ pageNumber: page })
          // Renewing a signed URL must not reset the reading position.
          if (hasViewport(scroller) && position.current?.page === page)
            scroller!.scrollTop = position.current.top
          initialized.current = true
          current.update()
          setLoading(false)
          syncHighlights()
        }
        const pageChanged = ({ pageNumber: page }: { pageNumber: number }) => {
          if (initialized.current) reportPage(page)
        }
        const renderFinished = ({
          error: renderError,
        }: {
          error?: unknown
        }) => {
          if (!disposed && renderError) {
            setError(
              "This page could not be displayed. Try another page or use Text view."
            )
            setLoading(false)
          }
          if (!disposed && !renderError) syncHighlights()
        }
        eventBus.on("pagesinit", pagesReady)
        eventBus.on("pagechanging", pageChanged)
        eventBus.on("pagerendered", renderFinished)
        detachEvents = () => {
          eventBus.off("pagesinit", pagesReady)
          eventBus.off("pagechanging", pageChanged)
          eventBus.off("pagerendered", renderFinished)
          linkService.setDocument(null)
        }

        task = library.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
        })
        const document = await task.promise
        if (disposed) return
        linkService.setDocument(document)
        current.setDocument(document)
      } catch {
        if (!disposed) {
          setError(
            "The document could not be displayed. Refresh to renew access, or use Text view."
          )
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      disposed = true
      initialized.current = false
      resize.disconnect()
      scroller.removeEventListener("scroll", savePosition)
      detachEvents?.()
      current?.setDocument(null)
      viewer.current = null
      setHighlightTargets([])
      void task?.destroy().catch(() => {})
    }
  }, [url])

  useEffect(() => {
    const current = viewer.current
    if (
      initialized.current &&
      current &&
      hasViewport(container.current) &&
      current.currentPageNumber !== pageNumber
    )
      current.scrollPageIntoView({
        pageNumber: Math.min(Math.max(1, pageNumber), current.pagesCount),
      })
  }, [pageNumber])

  useEffect(() => {
    if (initialized.current && viewer.current && hasViewport(container.current))
      applyScale(viewer.current)
  }, [fitMode, zoom])

  useEffect(() => {
    syncHighlights()
  }, [annotations])

  useEffect(() => {
    if (!focusAnnotation) return
    const annotation = annotations.find(
      (item) => item.id === focusAnnotation.id
    )
    const current = viewer.current
    if (
      !annotation ||
      !current ||
      !initialized.current ||
      !hasViewport(container.current)
    )
      return
    current.scrollPageIntoView({ pageNumber: annotation.locator.page })
    const frame = requestAnimationFrame(() => {
      const anchor = viewerHost.current?.querySelector<HTMLElement>(
        `[data-highlight-id="${annotation.id}"]`
      )
      if (!anchor) return
      anchor.scrollIntoView({ block: "center", inline: "nearest" })
      openAnnotation(annotation.id, anchor)
    })
    return () => cancelAnimationFrame(frame)
  }, [focusAnnotation, highlightTargets, annotations])

  return (
    <div
      className="relative min-h-0 flex-1 bg-muted/20"
      aria-label={`${title}, document viewer`}
      aria-busy={loading}
    >
      <div
        ref={container}
        tabIndex={0}
        aria-label="PDF pages"
        className="absolute inset-0 overflow-auto overscroll-contain [color-scheme:only_light]! [scrollbar-gutter:stable]"
        onPointerUp={(event) => {
          const point = { x: event.clientX, y: event.clientY }
          requestAnimationFrame(() => captureSelection(point))
        }}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow") || event.key === "Shift")
            captureSelection()
        }}
      >
        <div ref={viewerHost} className="pdfViewer" />
      </div>
      {highlightTargets.map(({ page, host, viewport }) =>
        createPortal(
          annotations
            .filter((item) => item.locator.page === page)
            .flatMap((item) =>
              item.locator.rects.map((rect, index) => (
                <span
                  key={`${item.id}:${index}`}
                  data-highlight-id={item.id}
                  className={cn(
                    "absolute rounded-[1px] mix-blend-multiply",
                    highlightColors[item.color],
                    activeAnnotationId === item.id &&
                      "outline outline-1 outline-foreground/20"
                  )}
                  style={viewportRectangle(rect, viewport)}
                />
              ))
            ),
          host,
          String(page)
        )
      )}
      {loading && !error && (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 top-4 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner /> Loading document…
        </p>
      )}
      {error && (
        <Alert
          variant="destructive"
          className="absolute inset-x-3 top-3 w-auto"
        >
          <AlertTitle>Document view unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
