"use client"

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, useReducedMotion } from "motion/react"
import type { GroupImperativeHandle } from "react-resizable-panels"
import {
  Expand,
  NavArrowLeft,
  NavArrowRight,
  Page,
  Book,
  ChatBubble,
  MoreVert,
  NavArrowDown,
  Copy,
  Check,
  OpenNewWindow,
  RefreshDouble,
  EditPencil,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { StudyTools } from "./study-tools"
import { Input } from "@workspace/ui/components/input"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@workspace/ui/components/resizable"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@workspace/ui/components/dropdown-menu"
import { Message, MessageContent } from "@workspace/ui/components/message"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@workspace/ui/components/message-scroller"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import {
  PdfPageView,
  type PdfTextSelection,
} from "@/components/workspace/pdf-page-view"
import { AnnotatedPdfView } from "./annotated-pdf-view"
import {
  MediaSourceView,
  type MaterialMedia,
  type MediaPlayback,
} from "./media-source-view"
import { ChatComposer } from "./chat-composer"
import { ChatAnswer } from "./chat-answer"
import type {
  ChatPreferences,
  ChatModelOption,
  ChatWebSource,
} from "@/lib/chat-preferences"
import {
  studyRequest,
  type RequestedStudyTool,
  type StudySet,
  type StudyToolType,
} from "./study-tools-types"
import {
  type ChatSourceOption,
  type ConversationSummary,
} from "./chat-controls"

export interface WorkspaceMaterial {
  id: string
  title: string
  status: "processing" | "ready" | "partial" | "failed"
  pageCount?: number
  extractionVersion?: number
  error?: string
}

export interface MaterialPage {
  pageNumber: number
  text: string
  locator?:
    { type: "paragraph"; paragraph: number } | { type: "page"; page: number }
  extractionStatus?: "ready" | "partial" | "unreadable"
  extractionMethod?: "text" | "native" | "ocr"
  unreadableRegions?: string[]
}

export interface StudyMessage {
  id: string
  role: "user" | "assistant"
  text: string
  requestId?: string
  state?:
    "queued" | "pending" | "complete" | "stopped" | "interrupted" | "failed"
  citations?: {
    page: number
    label?: string
    materialId?: string
    timeMs?: number
  }[]
  webSources?: ChatWebSource[]
}

export interface MaterialWorkspaceProps {
  material: WorkspaceMaterial
  studyOnly?: boolean
  sourceContent?: ReactNode
  sourceContentOpen?: boolean
  fileUrl?: string
  sourceKind?:
    "pdf" | "text" | "docx" | "pptx" | "audio" | "video" | "youtube" | "chat"
  media?: MaterialMedia
  initialTimeMs?: number
  onMediaPositionChange?: (timeMs: number, ordinal: number) => void
  onSourceRefresh?: () => void
  pages?: MaterialPage[]
  messages?: StudyMessage[]
  onAsk?: (question: string) => Promise<{ error?: string }>
  sending?: boolean
  awaitingUpload?: boolean
  onRetry?: () => void
  initialPage?: number
  initialShowSource?: boolean
  initialTab?: string
  onPageChange?: (page: number) => void
  onTabChange?: (tab: string) => void
  sourceLoading?: boolean
  historyLoading?: boolean
  contextMaterials?: ChatSourceOption[]
  selectedSourceIds?: string[]
  onSourcesChange?: (ids: string[]) => void
  conversations?: ConversationSummary[]
  conversationId?: string | null
  onConversationChange?: (id: string) => Promise<void>
  onNewConversation?: () => void
  onStop?: () => void
  preferences?: ChatPreferences
  availableModels?: ChatModelOption[]
  webSearchAvailable?: boolean
  onPreferencesChange?: (preferences: ChatPreferences) => void
}

export function MaterialWorkspace({
  material,
  studyOnly = false,
  sourceContent,
  sourceContentOpen = true,
  fileUrl,
  sourceKind = "pdf",
  media,
  initialTimeMs,
  onMediaPositionChange,
  onSourceRefresh,
  pages = [],
  messages = [],
  onAsk,
  sending = false,
  awaitingUpload = false,
  onRetry,
  initialPage = 1,
  initialShowSource = false,
  initialTab = "chat",
  onPageChange,
  onTabChange,
  sourceLoading = false,
  historyLoading = false,
  contextMaterials = [],
  selectedSourceIds = [],
  onSourcesChange,
  conversations = [],
  conversationId = null,
  onConversationChange,
  onNewConversation,
  onStop,
  preferences,
  availableModels,
  webSearchAvailable = false,
  onPreferencesChange,
}: MaterialWorkspaceProps) {
  const router = useRouter()
  const Root = studyOnly ? "div" : "main"
  const selectedSet = useSearchParams().get("set")
  const [page, setPage] = useState(initialPage)
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const [fitMode, setFitMode] = useState("width")
  const [view, setView] = useState("pdf")
  const [annotationsOpen, setAnnotationsOpen] = useState(false)
  const [tab, setTab] = useState(
    selectedSet || initialTab === "learn" ? "learn" : "chat"
  )
  const [showSource, setShowSource] = useState(initialShowSource)
  const standalone = sourceKind === "chat"
  const hasSourceContent = Boolean(sourceContent && sourceContentOpen)
  const singlePanel = studyOnly || (standalone && !hasSourceContent)
  const [focusStudy, setFocusStudy] = useState(standalone)
  const [draft, setDraft] = useState("")
  const [requestedTool, setRequestedTool] = useState<RequestedStudyTool | null>(
    null
  )
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const panels = useRef<GroupImperativeHandle | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedSources, setExpandedSources] = useState<
    Record<string, boolean>
  >({})
  const [mobileLayout, setMobileLayout] = useState(false)
  const [resumeTimeMs, setResumeTimeMs] = useState<number | undefined>(
    initialTimeMs
  )
  const mediaPlayer = useRef<MediaPlayback | null>(null)
  const reduceMotion = useReducedMotion()
  const [mediaSeek, setMediaSeek] = useState<{
    timeMs: number
    revision: number
  } | null>(null)
  const mediaSource =
    sourceKind === "audio" || sourceKind === "video" || sourceKind === "youtube"
  const pageCount = Math.max(
    1,
    material.pageCount ?? 0,
    ...pages.map((item) => item.pageNumber),
    media?.segments.length ?? 0
  )
  const currentPage = sourceLoading
    ? Math.max(1, page)
    : Math.min(page, pageCount)
  const currentSource = pages.find((item) => item.pageNumber === currentPage)
  const currentText = currentSource?.text
  const sourceLabel = sourceKind === "text" ? "paragraph" : "page"
  const ready = material.status === "ready" || material.status === "partial"
  const pending =
    sending ||
    submitting ||
    messages.some(
      (message) => message.state === "pending" || message.state === "queued"
    )

  useEffect(() => {
    if (hasSourceContent) {
      setFocusStudy(false)
      setShowSource(true)
    } else if (standalone) setFocusStudy(true)
  }, [hasSourceContent, standalone])

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 1023px)")
    const resize = () => {
      if (mediaPlayer.current)
        setResumeTimeMs(Math.round(mediaPlayer.current.currentTime * 1000))
      setMobileLayout(mobile.matches)
      panels.current?.setLayout(
        singlePanel
          ? { study: 100 }
          : mobile.matches
            ? mediaSource && !hasSourceContent
              ? { source: 0, study: 100 }
              : { source: showSource ? 100 : 0, study: showSource ? 0 : 100 }
            : { source: focusStudy ? 0 : 60, study: focusStudy ? 100 : 40 }
      )
    }
    resize()
    mobile.addEventListener("change", resize)
    return () => mobile.removeEventListener("change", resize)
  }, [showSource, focusStudy, mediaSource, singlePanel, hasSourceContent])

  function changePage(target: number) {
    const next = Math.min(pageCount, Math.max(1, Math.round(target) || 1))
    setPage(next)
    setPageDraft(null)
    onPageChange?.(next)
  }

  function changeTab(next: string) {
    setTab(next)
    onTabChange?.(next)
  }

  function selectStudyTool(type: StudyToolType) {
    setRequestedTool({ type, requestId: crypto.randomUUID() })
    changeTab("learn")
  }

  async function createSelectionNote(
    selection: PdfTextSelection
  ): Promise<void> {
    const { page: sourcePage, quote } = selection.locator
    const quotedPassage = quote
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")
    const result = await studyRequest<{ studySet: StudySet }>(
      `/api/materials/${material.id}/study-sets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "notes",
          title: `${material.title.slice(0, 200)} · page ${sourcePage}`,
          content: `${quotedPassage}\n\n[p. ${sourcePage}](/materials/${material.id}?page=${sourcePage})\n\n`,
        }),
      }
    )
    const url = new URL(window.location.href)
    url.searchParams.set("set", result.studySet.id)
    url.searchParams.delete("review")
    window.history.replaceState(null, "", url)
    changeTab("learn")
    if (mobileLayout) setShowSource(false)
  }

  function openCitation(target: number) {
    if (studyOnly) {
      router.push(`/materials/${material.id}?page=${target}`)
      return
    }
    if (media) {
      const segment = media.segments.find((item) => item.ordinal === target)
      if (segment)
        setMediaSeek((previous) => ({
          timeMs: segment.startMs,
          revision: (previous?.revision ?? 0) + 1,
        }))
    }
    changePage(target)
    setShowSource(true)
    setFocusStudy(false)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!onAsk || !draft.trim() || pending || !ready) return
    const question = draft.trim()
    setSubmitting(true)
    setError("")
    changeTab("chat")
    try {
      const result = await onAsk(question)
      if (result.error) setError(result.error)
      else setDraft((current) => (current.trim() === question ? "" : current))
    } catch {
      setError(
        "Your answer couldn’t finish. Your question is still here; try again when you’re connected."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function retryAnswer(message: StudyMessage) {
    const question = messages.find(
      (item) => item.role === "user" && item.requestId === message.requestId
    )?.text
    if (!onAsk || !question || pending) return
    setSubmitting(true)
    setError("")
    try {
      const result = await onAsk(question)
      if (result.error) setError(result.error)
      else setDraft((current) => (current.trim() === question ? "" : current))
    } catch {
      setError(
        "Your reply could not finish. Check your connection and try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Root
      id={studyOnly ? undefined : "main-content"}
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 overflow-hidden",
        !studyOnly && "pb-3 lg:px-4",
        !studyOnly && !mediaSource && "px-3"
      )}
    >
      {mobileLayout && mediaSource && !studyOnly && !hasSourceContent && (
        <motion.div
          initial={false}
          animate={{
            height: showSource ? "auto" : 0,
            opacity: showSource ? 1 : 0,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          inert={!showSource}
          aria-hidden={!showSource}
          className="shrink-0 overflow-hidden"
        >
          {media ? (
            <MediaSourceView
              compact
              media={media}
              title={material.title}
              annotationContext={
                material.extractionVersion
                  ? {
                      materialId: material.id,
                      extractionVersion: material.extractionVersion,
                    }
                  : undefined
              }
              playerRef={mediaPlayer}
              initialTimeMs={
                resumeTimeMs ??
                media.segments.find((item) => item.ordinal === initialPage)
                  ?.startMs ??
                0
              }
              seek={mediaSeek}
              onPositionChange={onMediaPositionChange}
              onRefresh={onSourceRefresh}
            />
          ) : (
            <p role="status" className="p-5 text-sm text-muted-foreground">
              Preparing your player and transcript…
            </p>
          )}
        </motion.div>
      )}
      <div
        className={cn(
          "flex items-center gap-2 lg:hidden",
          singlePanel && "hidden",
          mediaSource && "px-1"
        )}
      >
        <Button
          variant="outline"
          onClick={() => setShowSource(!showSource)}
          className={cn("rounded-full", mediaSource && "h-8 w-full rounded-xl")}
        >
          <Page aria-hidden="true" />
          {hasSourceContent
            ? showSource
              ? "Show study tools"
              : "Show exam"
            : mediaSource
              ? `${showSource ? "Hide" : "Show"} ${sourceKind === "audio" ? "Audio" : "Video"}`
              : showSource
                ? "Hide source"
                : "Show source"}
        </Button>
        <span
          className={cn(
            "truncate text-xs text-muted-foreground",
            mediaSource && "hidden"
          )}
        >
          {material.title}
        </span>
      </div>
      <ResizablePanelGroup
        groupRef={panels}
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        {!singlePanel && (
          <ResizablePanel
            id="source"
            defaultSize="60%"
            minSize="30%"
            collapsible
            collapsedSize="0%"
            className={cn(
              "min-w-0",
              (!showSource || (mediaSource && !hasSourceContent)) &&
                "max-lg:hidden",
              focusStudy && "lg:hidden"
            )}
          >
            <section
              aria-label="Source viewer"
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden",
                !mediaSource && !hasSourceContent && "rounded-2xl border"
              )}
            >
              {sourceContent && (
                <div
                  inert={!hasSourceContent}
                  aria-hidden={!hasSourceContent}
                  className={cn(
                    "h-full min-h-0 overflow-y-auto",
                    !hasSourceContent && "hidden"
                  )}
                >
                  {sourceContent}
                </div>
              )}
              <div
                inert={hasSourceContent}
                aria-hidden={hasSourceContent}
                className={cn(
                  "flex h-full min-h-0 flex-col",
                  hasSourceContent && "hidden"
                )}
              >
                {mediaSource ? (
                  mobileLayout ? null : media ? (
                    <MediaSourceView
                      media={media}
                      title={material.title}
                      annotationContext={
                        material.extractionVersion
                          ? {
                              materialId: material.id,
                              extractionVersion: material.extractionVersion,
                            }
                          : undefined
                      }
                      playerRef={mediaPlayer}
                      initialTimeMs={
                        resumeTimeMs ??
                        media.segments.find(
                          (item) => item.ordinal === initialPage
                        )?.startMs ??
                        0
                      }
                      seek={mediaSeek}
                      onPositionChange={onMediaPositionChange}
                      onRefresh={onSourceRefresh}
                    />
                  ) : (
                    <Empty className="h-full">
                      <EmptyHeader>
                        <EmptyTitle>
                          {sourceLoading
                            ? "Loading your source"
                            : ready || material.status === "failed"
                              ? "Media could not be loaded"
                              : "Preparing your media"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {sourceLoading
                            ? "Your player and transcript are loading."
                            : material.status === "failed"
                              ? "Try processing this source again or add another material."
                              : ready
                                ? "Refresh to reconnect to your source and transcript."
                                : "Your player and transcript will appear when processing finishes. You can leave this page and return."}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!sourceLoading &&
                      (ready || material.status === "failed") ? (
                        <Button variant="outline" onClick={onSourceRefresh}>
                          Refresh source
                        </Button>
                      ) : (
                        <Spinner />
                      )}
                    </Empty>
                  )
                ) : (
                  <>
                    <div
                      className={cn(
                        "grid h-10 shrink-0 items-center gap-1 border-b px-2 sm:grid-cols-[1fr_auto_1fr]",
                        fileUrl &&
                          sourceKind !== "text" &&
                          material.extractionVersion &&
                          view === "pdf"
                          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                          : "grid-cols-[1fr_auto]"
                      )}
                    >
                      {fileUrl &&
                      sourceKind !== "text" &&
                      material.extractionVersion &&
                      view === "pdf" ? (
                        <Button
                          variant={annotationsOpen ? "secondary" : "ghost"}
                          size="sm"
                          className="justify-self-start rounded-xl max-sm:px-2"
                          aria-expanded={annotationsOpen}
                          onClick={() => setAnnotationsOpen((open) => !open)}
                        >
                          <EditPencil data-icon="inline-start" />
                          <span className="max-sm:sr-only">Annotations</span>
                        </Button>
                      ) : (
                        <span className="flex min-w-0 items-center gap-2 px-2 text-sm text-muted-foreground max-sm:hidden">
                          <Page
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {sourceKind === "text"
                            ? "Text"
                            : view === "pdf"
                              ? "Document"
                              : "Extracted text"}
                        </span>
                      )}
                      <div className="flex min-w-0 items-center justify-start gap-1 sm:justify-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Previous ${sourceLabel}`}
                          disabled={currentPage <= 1}
                          onClick={() => changePage(currentPage - 1)}
                        >
                          <NavArrowLeft aria-hidden="true" />
                        </Button>
                        <Input
                          aria-label={`Source ${sourceLabel}`}
                          inputMode="numeric"
                          value={pageDraft ?? String(currentPage)}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => setPageDraft(event.target.value)}
                          onBlur={() => {
                            if (pageDraft !== null)
                              changePage(Number(pageDraft))
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              event.currentTarget.blur()
                          }}
                          className="h-7 w-9 shrink-0 rounded-xl px-1 text-center"
                        />
                        <span className="shrink-0 px-1 text-sm whitespace-nowrap text-muted-foreground">
                          /{" "}
                          {material.pageCount || pages.length ? pageCount : "—"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Next ${sourceLabel}`}
                          disabled={currentPage >= pageCount}
                          onClick={() => changePage(currentPage + 1)}
                        >
                          <NavArrowRight aria-hidden="true" />
                        </Button>
                        {sourceKind !== "text" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="ml-1 h-7 rounded-xl px-2 font-normal"
                                />
                              }
                            >
                              {fitMode === "page"
                                ? "Page fit"
                                : fitMode === "width"
                                  ? "Page width"
                                  : `${Number(fitMode) * 100}%`}
                              <NavArrowDown
                                aria-hidden="true"
                                data-icon="inline-end"
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center">
                              <DropdownMenuRadioGroup
                                value={fitMode}
                                onValueChange={(value) =>
                                  setFitMode(String(value))
                                }
                              >
                                <DropdownMenuRadioItem
                                  value="page"
                                  closeOnClick
                                >
                                  Page fit
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem
                                  value="width"
                                  closeOnClick
                                >
                                  Page width
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="1" closeOnClick>
                                  100%
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="1.5" closeOnClick>
                                  150%
                                </DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="2" closeOnClick>
                                  200%
                                </DropdownMenuRadioItem>
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="justify-self-end"
                              aria-label="Document options"
                            />
                          }
                        >
                          <MoreVert aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              disabled={!fileUrl}
                              onClick={() => setView("pdf")}
                            >
                              Document view
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setView("text")}>
                              Extracted text
                            </DropdownMenuItem>
                            {fileUrl && (
                              <DropdownMenuItem
                                render={
                                  <a
                                    href={fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  />
                                }
                              >
                                <OpenNewWindow aria-hidden="true" />
                                {sourceKind === "pdf"
                                  ? "Open original PDF"
                                  : "Open converted PDF"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {fileUrl && sourceKind !== "text" && view === "pdf" ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        {material.extractionVersion ? (
                          <AnnotatedPdfView
                            materialId={material.id}
                            extractionVersion={material.extractionVersion}
                            annotationsOpen={annotationsOpen}
                            onCloseAnnotations={() => setAnnotationsOpen(false)}
                            onRefreshSource={onSourceRefresh}
                            onCreateNote={createSelectionNote}
                            url={fileUrl}
                            pageNumber={currentPage}
                            onPageChange={changePage}
                            title={material.title}
                            fitMode={fitMode === "page" ? "page" : "width"}
                            zoom={
                              fitMode === "page" || fitMode === "width"
                                ? undefined
                                : Number(fitMode)
                            }
                          />
                        ) : (
                          <PdfPageView
                            url={fileUrl}
                            pageNumber={currentPage}
                            onPageChange={changePage}
                            title={material.title}
                            fitMode={fitMode === "page" ? "page" : "width"}
                            zoom={
                              fitMode === "page" || fitMode === "width"
                                ? undefined
                                : Number(fitMode)
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
                        {sourceLoading ? (
                          <div
                            role="status"
                            aria-label="Loading document"
                            className="flex flex-col gap-5 p-6"
                          >
                            <Skeleton className="h-8 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <span className="sr-only">
                              Loading your document…
                            </span>
                          </div>
                        ) : currentText ? (
                          <article className="mx-auto min-h-full max-w-2xl bg-background p-6 shadow-sm sm:p-10">
                            <h1 className="text-xl font-medium">
                              {material.title}
                            </h1>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {sourceKind === "text" ? "Paragraph" : "Page"}{" "}
                              {currentPage}
                              {sourceKind === "pdf"
                                ? " · extracted text"
                                : sourceKind === "docx" || sourceKind === "pptx"
                                  ? " · converted document"
                                  : ""}
                            </p>
                            <div className="mt-8 text-sm leading-7 whitespace-pre-wrap">
                              {currentText}
                            </div>
                          </article>
                        ) : material.status === "processing" &&
                          !awaitingUpload ? (
                          <div
                            role="status"
                            aria-label="Preparing source text"
                            className="flex flex-col gap-5 p-6"
                          >
                            <Skeleton className="h-8 w-3/4" />
                            {[0, 1, 2, 3].map((item) => (
                              <Skeleton key={item} className="h-4 w-full" />
                            ))}
                            <p className="text-sm text-muted-foreground">
                              Preparing your material…
                            </p>
                          </div>
                        ) : (
                          <Empty className="h-full">
                            <EmptyHeader>
                              <Page
                                aria-hidden="true"
                                className="size-8 text-muted-foreground"
                              />
                              <EmptyTitle>
                                {awaitingUpload
                                  ? "Upload not finished"
                                  : `No text available for this ${sourceLabel}`}
                              </EmptyTitle>
                              <EmptyDescription>
                                {awaitingUpload
                                  ? "Return to your library to select this file and upload it again."
                                  : currentSource?.unreadableRegions?.length
                                    ? `This page could not be read reliably: ${currentSource.unreadableRegions.join("; ")}. Check the original document; answers will exclude this page.`
                                    : "Try the document view. Scanned or unclear pages may need additional processing."}
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </ResizablePanel>
        )}
        {!singlePanel && !focusStudy && (
          <ResizableHandle className="hidden w-3 shrink-0 bg-transparent after:w-px hover:after:bg-border lg:flex" />
        )}
        <ResizablePanel
          id="study"
          defaultSize={singlePanel ? "100%" : "40%"}
          minSize="30%"
          collapsible
          collapsedSize="0%"
          className={cn(
            "min-w-0",
            showSource &&
              (!mediaSource || hasSourceContent) &&
              !studyOnly &&
              "max-lg:hidden"
          )}
        >
          <section
            aria-label="Study panel"
            className={cn(
              "flex h-full min-h-0 flex-col gap-2",
              mediaSource && "px-3 lg:px-0"
            )}
          >
            {material.status !== "ready" && material.status !== "partial" && (
              <Alert className="rounded-2xl">
                <AlertTitle>
                  {awaitingUpload
                    ? "Your upload is incomplete"
                    : material.status === "failed"
                      ? "This material couldn’t be processed"
                      : "Preparing your study workspace"}
                </AlertTitle>
                <AlertDescription>
                  {material.error ||
                    (awaitingUpload
                      ? "Choose the original file again to continue. No study answer will use an unfinished upload."
                      : material.status === "failed"
                        ? "Your original file is kept. Try processing it again."
                        : "You can leave this page and return. Your material will be ready when processing finishes.")}
                  {onRetry && material.status === "failed" && (
                    <Button
                      variant="outline"
                      onClick={onRetry}
                      className="mt-3 w-fit"
                    >
                      Try again
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Tabs
              value={tab}
              onValueChange={(value) => changeTab(String(value))}
              className="min-h-0 flex-1 gap-2 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <TabsList className="h-9 flex-1 justify-start gap-1 bg-transparent p-0">
                  <TabsTrigger
                    value="chat"
                    className="h-8 flex-none gap-2 rounded-xl px-3 font-normal shadow-none! data-active:bg-muted"
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      {tab === "chat" ? (
                        <span className="size-2 rounded-full bg-plan-foreground" />
                      ) : (
                        <ChatBubble className="text-plan-foreground" />
                      )}
                    </span>
                    <span
                      className={standalone ? "max-w-48 truncate" : undefined}
                    >
                      {standalone ? material.title : "Chat"}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="learn"
                    className="h-8 flex-none gap-2 rounded-xl px-3 font-normal shadow-none! data-active:bg-muted"
                  >
                    <span
                      className="flex size-4 shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      {tab === "learn" ? (
                        <span className="size-2 rounded-full bg-plan-foreground" />
                      ) : (
                        <Book />
                      )}
                    </span>
                    Learn Tab
                  </TabsTrigger>
                </TabsList>
                {!singlePanel && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFocusStudy(!focusStudy)}
                    aria-label={
                      focusStudy ? "Show source panel" : "Focus study panel"
                    }
                    className="hidden lg:inline-flex"
                  >
                    <Expand aria-hidden="true" />
                  </Button>
                )}
              </div>
              <TabsContent value="chat" className="min-h-0 overflow-hidden">
                {historyLoading ? (
                  <div
                    role="status"
                    aria-label="Loading conversation"
                    className="flex flex-col gap-5 px-4 py-6"
                  >
                    <Skeleton className="ml-auto h-14 w-4/5 rounded-2xl" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : messages.length === 0 && !pending ? (
                  <Empty className="h-full border-0">
                    <EmptyHeader>
                      <EmptyTitle>
                        {standalone
                          ? "What would you like to learn?"
                          : "Understand your material"}
                      </EmptyTitle>
                      <EmptyDescription>
                        {standalone
                          ? "Ask a study question, or add your own materials as context. This conversation is saved in My Library."
                          : ready
                            ? "Ask a question about this source. Answers will link back to the pages they use."
                            : "Your questions can begin once this material is ready."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <MessageScrollerProvider autoScroll>
                    <MessageScroller>
                      <MessageScrollerViewport>
                        <MessageScrollerContent
                          className={cn(
                            "gap-8 px-4 py-4",
                            standalone && "mx-auto w-full max-w-3xl py-8"
                          )}
                        >
                          {messages.map((message) => (
                            <MessageScrollerItem
                              key={message.id}
                              messageId={message.id}
                              scrollAnchor={message.role === "user"}
                            >
                              <Message
                                align={
                                  message.role === "user" ? "end" : "start"
                                }
                              >
                                <MessageContent>
                                  <p className="sr-only">
                                    {message.role === "user"
                                      ? "You"
                                      : "Abstruck"}
                                  </p>
                                  <Bubble
                                    variant={
                                      message.role === "user"
                                        ? "muted"
                                        : "ghost"
                                    }
                                    align={
                                      message.role === "user" ? "end" : "start"
                                    }
                                    className={
                                      message.role === "user"
                                        ? "max-w-[95%]"
                                        : "max-w-full"
                                    }
                                  >
                                    <BubbleContent
                                      className={cn(
                                        "text-base leading-7 whitespace-pre-wrap",
                                        message.role === "user" &&
                                          "rounded-2xl px-4 py-3"
                                      )}
                                    >
                                      {message.role === "assistant" ? (
                                        <ChatAnswer text={message.text} />
                                      ) : (
                                        message.text
                                      )}
                                    </BubbleContent>
                                  </Bubble>
                                  {message.citations?.length ? (
                                    <div
                                      className="flex flex-wrap gap-1.5"
                                      aria-label="Sources"
                                    >
                                      {(expandedSources[message.id]
                                        ? message.citations
                                        : message.citations.slice(0, 3)
                                      ).map((citation, index) => (
                                        <Button
                                          key={`${citation.page}-${index}`}
                                          render={
                                            citation.materialId &&
                                            citation.materialId !==
                                              material.id ? (
                                              <a
                                                href={
                                                  typeof citation.timeMs ===
                                                  "number"
                                                    ? `/materials/${citation.materialId}?t=${citation.timeMs / 1000}`
                                                    : `/materials/${citation.materialId}?page=${citation.page}`
                                                }
                                              />
                                            ) : undefined
                                          }
                                          variant="secondary"
                                          size="xs"
                                          className="rounded-full"
                                          onClick={() =>
                                            !citation.materialId ||
                                            citation.materialId === material.id
                                              ? openCitation(citation.page)
                                              : undefined
                                          }
                                        >
                                          {citation.label ||
                                            `p. ${citation.page}`}
                                        </Button>
                                      ))}
                                      {message.citations.length > 3 && (
                                        <Button
                                          variant="ghost"
                                          size="xs"
                                          className="rounded-full text-muted-foreground"
                                          aria-expanded={
                                            !!expandedSources[message.id]
                                          }
                                          onClick={() =>
                                            setExpandedSources((current) => ({
                                              ...current,
                                              [message.id]:
                                                !current[message.id],
                                            }))
                                          }
                                        >
                                          {expandedSources[message.id]
                                            ? "See less"
                                            : `See more (${message.citations.length - 3})`}
                                        </Button>
                                      )}
                                    </div>
                                  ) : null}
                                  {message.role === "assistant" &&
                                    Boolean(message.webSources?.length) && (
                                      <div
                                        className="flex flex-wrap gap-1.5"
                                        aria-label="Web sources"
                                      >
                                        {message.webSources
                                          ?.filter((source) =>
                                            source.url.startsWith("https://")
                                          )
                                          .map((source) => (
                                            <Button
                                              key={source.url}
                                              render={
                                                <a
                                                  href={source.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                />
                                              }
                                              variant="secondary"
                                              size="xs"
                                              className="max-w-full rounded-full"
                                            >
                                              <OpenNewWindow
                                                aria-hidden="true"
                                                data-icon="inline-start"
                                              />
                                              <span className="truncate">
                                                {source.title || source.url}
                                              </span>
                                            </Button>
                                          ))}
                                      </div>
                                    )}
                                  {message.role === "assistant" &&
                                    message.state &&
                                    !["complete", "pending", "queued"].includes(
                                      message.state
                                    ) && (
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span>
                                          {message.state === "stopped"
                                            ? "Reply stopped"
                                            : message.state === "failed"
                                              ? "Reply failed"
                                              : "Reply interrupted"}
                                          {message.text
                                            ? " · unfinished draft, sources not verified"
                                            : ""}
                                        </span>
                                        {onAsk && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="xs"
                                            disabled={pending}
                                            onClick={() => {
                                              void retryAnswer(message)
                                            }}
                                          >
                                            <RefreshDouble
                                              data-icon="inline-start"
                                              aria-hidden="true"
                                            />
                                            Retry
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  {message.role === "assistant" &&
                                    message.text && (
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-muted-foreground"
                                        aria-label={
                                          copiedId === message.id
                                            ? "Answer copied"
                                            : "Copy answer"
                                        }
                                        onClick={async () => {
                                          try {
                                            await navigator.clipboard.writeText(
                                              message.text
                                            )
                                            setCopiedId(message.id)
                                          } catch {
                                            setError(
                                              "Copy failed. Select the answer text and copy it manually."
                                            )
                                          }
                                        }}
                                      >
                                        {copiedId === message.id ? (
                                          <Check aria-hidden="true" />
                                        ) : (
                                          <Copy aria-hidden="true" />
                                        )}
                                      </Button>
                                    )}
                                </MessageContent>
                              </Message>
                            </MessageScrollerItem>
                          ))}
                          {pending && (
                            <MessageScrollerItem messageId="answer-pending">
                              <p
                                role="status"
                                className="flex items-center gap-2 text-sm text-muted-foreground"
                              >
                                <Spinner />
                                {standalone && selectedSourceIds.length === 0
                                  ? "Thinking…"
                                  : messages.some(
                                        (message) =>
                                          message.role === "assistant" &&
                                          message.state === "pending" &&
                                          message.text
                                      )
                                    ? "Checking sources…"
                                    : "Reading your material…"}
                              </p>
                            </MessageScrollerItem>
                          )}
                        </MessageScrollerContent>
                      </MessageScrollerViewport>
                      <MessageScrollerButton />
                    </MessageScroller>
                  </MessageScrollerProvider>
                )}
              </TabsContent>
              <TabsContent
                value="learn"
                keepMounted
                className="min-h-0 overflow-y-auto"
              >
                <StudyTools
                  materialId={material.id}
                  ready={ready}
                  onOpenCitation={openCitation}
                  requestedTool={requestedTool}
                  conversationId={conversationId}
                  selectedSourceIds={selectedSourceIds}
                  conversationReady={
                    !pending &&
                    messages.some(
                      (message) =>
                        message.role === "assistant" &&
                        message.state === "complete" &&
                        Boolean(message.text.trim())
                    )
                  }
                />
              </TabsContent>
            </Tabs>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div
              className={cn(
                "shrink-0",
                standalone && "mx-auto w-full max-w-3xl"
              )}
            >
              <ChatComposer
                draft={draft}
                ready={ready}
                pending={pending}
                available={Boolean(onAsk)}
                historyLoading={historyLoading}
                contextMaterials={contextMaterials}
                selectedSourceIds={selectedSourceIds}
                preferences={preferences}
                availableModels={availableModels}
                webSearchAvailable={webSearchAvailable}
                onPreferencesChange={onPreferencesChange}
                onSelectTool={selectStudyTool}
                minimumSources={standalone ? 0 : 1}
                conversations={conversations}
                conversationId={conversationId}
                onDraftChange={setDraft}
                onSubmit={send}
                onSourcesChange={onSourcesChange}
                onConversationChange={onConversationChange}
                onNewConversation={
                  onNewConversation
                    ? () => {
                        setError("")
                        onNewConversation()
                      }
                    : undefined
                }
                onStop={onStop}
              />
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
    </Root>
  )
}
