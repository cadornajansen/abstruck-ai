"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EditPencil, MoreVert } from "iconoir-react"
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import { TableCell, TableRow } from "@workspace/ui/components/table"
import type { MaterialListItem } from "./collection-view"
import { MaterialIcon } from "./material-icon"
import type { StudySpace } from "./study-home"
import type { MaterialLocation } from "@/lib/organisation-types"
import { InlineTitleEditor } from "./inline-title-editor"
import { MoveMenu, type MoveDestination } from "./move-menu"
import {
  OrganisationRequestError,
  organisationMessage,
  organisationRequest,
} from "./organisation-request"

function PdfThumbnail({
  url,
  title,
  sourceType,
}: {
  url?: string
  title: string
  sourceType?: string
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    url ? "loading" : "unavailable"
  )

  useEffect(() => {
    if (!host.current || !url) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [url])

  useEffect(() => {
    if (!url) {
      setState("unavailable")
      return
    }
    if (!visible || !host.current) return
    const target = host.current
    let disposed = false
    let loadingTask: PDFDocumentLoadingTask | undefined
    let renderTask: RenderTask | undefined
    setState("loading")
    async function render(): Promise<void> {
      try {
        const library = await import("pdfjs-dist")
        if (disposed) return
        library.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.min.mjs?v=${library.version}`
        loadingTask = library.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          disableAutoFetch: true,
          disableStream: true,
        })
        const document = await loadingTask.promise
        const page = await document.getPage(1)
        if (disposed) return
        const original = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({
          scale:
            ((target.clientWidth || 277) *
              Math.min(window.devicePixelRatio, 2)) /
            original.width,
        })
        const canvas = window.document.createElement("canvas")
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.className = "block h-auto w-full"
        canvas.setAttribute("aria-hidden", "true")
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Canvas unavailable")
        renderTask = page.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise
        if (disposed) return
        target.replaceChildren(canvas)
        setState("ready")
        const finishedTask = loadingTask
        loadingTask = undefined
        void finishedTask.destroy().catch(() => {})
      } catch {
        if (!disposed) setState("unavailable")
      }
    }
    void render()
    return () => {
      disposed = true
      renderTask?.cancel()
      void loadingTask?.destroy().catch(() => {})
      target.replaceChildren()
    }
  }, [url, visible])

  return (
    <div
      className="relative h-[156px] overflow-hidden border-b bg-background"
      role="img"
      aria-label={
        state === "ready"
          ? `First page preview of ${title}`
          : `Document preview ${state}`
      }
    >
      <div ref={host} className="h-full w-full" />
      {state === "loading" && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-none" />
      )}
      {state === "unavailable" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/20 text-muted-foreground">
          <MaterialIcon type={sourceType} className="size-7" />
          <span className="text-xs">Preview unavailable</span>
        </div>
      )}
    </div>
  )
}

function materialAge(createdAt: string, now: number | null): string {
  const timestamp = Date.parse(createdAt)
  if (!Number.isFinite(timestamp)) return ""
  if (now === null) return new Date(timestamp).toISOString().slice(0, 10)
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes === 0) return "Just now"
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (minutes < 60) return relative.format(-minutes, "minute")
  if (minutes < 1440) return relative.format(-Math.floor(minutes / 60), "hour")
  return relative.format(-Math.floor(minutes / 1440), "day")
}

export function AddedOn({
  createdAt,
  detail = "",
  className,
}: {
  createdAt?: string
  detail?: string
  className?: string
}) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return createdAt ? (
    <time dateTime={createdAt} className={className}>
      {materialAge(createdAt, now)}
    </time>
  ) : (
    <span className={className}>{detail}</span>
  )
}

function MaterialNameEditor({
  item,
  onCancel,
}: {
  item: MaterialListItem
  onCancel: () => void
}) {
  const router = useRouter()
  return (
    <InlineTitleEditor
      title={item.title}
      maxLength={240}
      label="Material name"
      onCancel={onCancel}
      onSave={async (title) => {
        await organisationRequest<{ id: string; title: string }>(
          "/api/materials/" + item.id,
          { method: "PATCH", body: JSON.stringify({ title }) }
        )
        router.refresh()
      }}
    />
  )
}

export function MaterialActions({
  item,
  spaces,
  onDelete,
  onRename,
  className,
}: {
  item: MaterialListItem
  spaces?: StudySpace[]
  onDelete?: () => void
  onRename?: () => void
  className?: string
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [location, setLocation] = useState<MaterialLocation>({
    materialId: item.id,
    spaceId: item.spaceId ?? null,
    folderId: item.folderId ?? null,
    revision: item.locationRevision ?? 0,
  })
  const inFlight = useRef(false)
  const renameAfterClose = useRef(false)
  useEffect(() => {
    setLocation({
      materialId: item.id,
      spaceId: item.spaceId ?? null,
      folderId: item.folderId ?? null,
      revision: item.locationRevision ?? 0,
    })
  }, [item.id, item.spaceId, item.folderId, item.locationRevision])
  const canMove =
    spaces !== undefined &&
    item.locationRevision !== undefined &&
    item.sourceType !== "chat"
  const canRename =
    onRename &&
    item.status &&
    ["ready", "partial", "failed"].includes(item.status)

  async function move(destination: MoveDestination) {
    if (inFlight.current || !canMove) return
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      const next = await organisationRequest<MaterialLocation>(
        "/api/materials/" + item.id + "/location",
        {
          method: "PATCH",
          body: JSON.stringify({ ...destination, revision: location.revision }),
        }
      )
      setLocation(next)
      setMenuOpen(false)
      router.refresh()
    } catch (cause) {
      if (cause instanceof OrganisationRequestError && cause.location) {
        setLocation(cause.location)
        router.refresh()
      }
      setError(organisationMessage(cause))
      setMenuOpen(true)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        if (open) renameAfterClose.current = false
        setMenuOpen(open)
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={"Actions for " + item.title}
            disabled={pending}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              className
            )}
          />
        }
      >
        {pending ? <Spinner /> : <MoreVert />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        finalFocus={() => (renameAfterClose.current ? false : true)}
      >
        {error && (
          <Alert variant="destructive" className="mb-1 p-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem render={<a href={item.href} />}>
            Open material
          </DropdownMenuItem>
          {canMove && (
            <MoveMenu
              spaces={spaces}
              current={location}
              disabled={pending}
              onMove={(destination) => void move(destination)}
            />
          )}
          {canRename && (
            <DropdownMenuItem
              onClick={() => {
                renameAfterClose.current = true
                setMenuOpen(false)
                onRename?.()
              }}
            >
              <EditPencil />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            disabled={!onDelete}
            onClick={onDelete}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MaterialCard({
  item,
  spaces,
  onDelete,
  variant = "preview",
}: {
  item: MaterialListItem
  spaces?: StudySpace[]
  onDelete?: () => void
  variant?: "preview" | "icon"
}) {
  const [renaming, setRenaming] = useState(false)
  const titleLink = useRef<HTMLAnchorElement>(null)
  function finishRename() {
    setRenaming(false)
    requestAnimationFrame(() => titleLink.current?.focus())
  }
  return (
    <article
      className={cn(
        "group relative overflow-hidden border bg-card",
        variant === "preview" ? "rounded-[28px] shadow-xs" : "rounded-3xl"
      )}
    >
      <a
        href={item.href}
        aria-label={"Open " + item.title}
        className="block rounded-t-[28px] focus-visible:outline-2 focus-visible:outline-ring"
      >
        {variant === "preview" ? (
          <PdfThumbnail
            url={item.previewUrl}
            title={item.title}
            sourceType={item.sourceType}
          />
        ) : (
          <div className="flex h-32 items-center justify-center bg-muted/60">
            <MaterialIcon
              type={item.sourceType}
              className="size-8 text-muted-foreground"
            />
          </div>
        )}
      </a>
      <div
        className={cn(
          "flex min-w-0 gap-3",
          variant === "preview"
            ? "min-h-[83px] items-center px-4 py-3"
            : "flex-col p-4"
        )}
      >
        {variant === "preview" && (
          <MaterialIcon
            type={item.sourceType}
            className="size-5 shrink-0 text-muted-foreground"
          />
        )}
        <div className="min-w-0 flex-1">
          {renaming ? (
            <MaterialNameEditor item={item} onCancel={finishRename} />
          ) : (
            <a
              ref={titleLink}
              href={item.href}
              className="block rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            >
              <h2 className="truncate text-base leading-6">{item.title}</h2>
            </a>
          )}
          <AddedOn
            createdAt={item.createdAt}
            detail={item.detail}
            className={cn(
              "mt-0.5 block text-xs text-muted-foreground",
              variant === "icon" && "mt-2 text-sm"
            )}
          />
          {variant === "icon" && (
            <p className="mt-1 text-xs text-muted-foreground">{item.space}</p>
          )}
        </div>
      </div>
      <MaterialActions
        item={item}
        spaces={spaces}
        onRename={() => setRenaming(true)}
        onDelete={onDelete}
        className={cn(
          "absolute top-2 right-2",
          variant === "preview" &&
            "bg-background/90 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
        )}
      />
    </article>
  )
}

export function MaterialListRow({
  item,
  spaces,
  onDelete,
  nested = false,
}: {
  item: MaterialListItem
  spaces?: StudySpace[]
  onDelete?: () => void
  nested?: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  const titleLink = useRef<HTMLAnchorElement>(null)
  function finishRename() {
    setRenaming(false)
    requestAnimationFrame(() => titleLink.current?.focus())
  }
  return (
    <TableRow className="h-14 border-0 hover:bg-muted/30">
      <TableCell className={cn("min-w-0 px-4 py-2", nested && "pl-12")}>
        {renaming ? (
          <MaterialNameEditor item={item} onCancel={finishRename} />
        ) : (
          <a
            ref={titleLink}
            href={item.href}
            className="flex min-w-0 items-center gap-3 rounded-md py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MaterialIcon
              type={item.sourceType}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate text-sm text-foreground">
              {item.title}
            </span>
          </a>
        )}
      </TableCell>
      <TableCell className="px-3 py-2 text-muted-foreground">
        <AddedOn
          createdAt={item.createdAt}
          detail={item.detail}
          className="block truncate text-xs sm:text-sm"
        />
      </TableCell>
      <TableCell className="pr-2 pl-0 text-right">
        <MaterialActions
          item={item}
          spaces={spaces}
          onRename={() => setRenaming(true)}
          onDelete={onDelete}
        />
      </TableCell>
    </TableRow>
  )
}
