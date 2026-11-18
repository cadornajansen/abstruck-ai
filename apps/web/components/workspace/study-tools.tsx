"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Book,
  Check,
  Copy,
  Download,
  NavArrowLeft,
  Notes,
  Page,
  Journal,
  MultiplePages,
  OpenBook,
  Podcast,
  VideoCamera,
  Sparks,
  Network,
  GitBranch,
  CurveArray,
  StatsUpSquare,
  GraphUp,
} from "iconoir-react"
import { Settings2 } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldSet,
  FieldLegend,
} from "@workspace/ui/components/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import { StudyNote } from "./study-tools-note"
import { StudyFlashcards } from "./study-tools-flashcards"
import { AssessmentSetup } from "./assessment-setup"
import { AssessmentSession } from "./assessment-session"
import { StudyText } from "./study-tools-text"
import { ShareOutputAction } from "./sharing-dialog"
import { StudyOutputSources } from "./study-output-citations"
import { StudyOutputView } from "./study-output-view"
import { StudyOutputSetup } from "./study-output-setup"
import { isStudyOutputType, studyOutputTools } from "./study-output-catalog"
import type { StudyOutputType } from "@/lib/study-output-types"
import {
  studyRequest,
  studyError,
  exportStudyMarkdown,
  type StudySet,
  type StudySetDetail,
  type StudyToolType,
  type RequestedStudyTool,
  type StudyCitation,
} from "./study-tools-types"

type GenerationType = "summary" | "flashcards"
const toolIcons = {
  notes: Notes,
  summary: Page,
  flashcards: Book,
  quiz: Check,
  exam: Page,
  podcast: Podcast,
  video: VideoCamera,
  interactive: Sparks,
  "mind-map": Network,
  flowchart: GitBranch,
  timeline: CurveArray,
  "bar-chart": StatsUpSquare,
  "line-chart": GraphUp,
} satisfies Record<StudySet["type"], typeof Page>
const toolLabels: Record<StudySet["type"], string> = {
  notes: "Notes",
  summary: "Summary",
  flashcards: "Flashcards",
  quiz: "Quiz",
  exam: "Exam",
  podcast: "Podcast",
  video: "Video",
  interactive: "Interactive",
  "mind-map": "Mind Map",
  flowchart: "Flow Chart",
  timeline: "Timeline",
  "bar-chart": "Bar Chart",
  "line-chart": "Line Chart",
}
const generationTools = [
  ...studyOutputTools.filter(
    (tool) => tool.type === "podcast" || tool.type === "video"
  ),
  {
    type: "summary",
    title: "Summary",
    icon: Journal,
    chip: "bg-(--tool-summary-bg) text-(--tool-summary)",
  },
  {
    type: "quiz",
    title: "Quiz",
    icon: OpenBook,
    chip: "bg-(--tool-quiz-bg) text-(--tool-quiz)",
  },
  {
    type: "flashcards",
    title: "Flashcards",
    icon: MultiplePages,
    chip: "bg-(--tool-flashcards-bg) text-(--tool-flashcards)",
  },
  {
    type: "notes",
    title: "Notes",
    icon: Notes,
    chip: "bg-(--tool-notes-bg) text-(--tool-notes)",
  },
] as const
const templates = [
  {
    value: "detailed",
    label: "Detailed Summary",
    detail: "A comprehensive overview",
  },
  {
    value: "cheat-sheet",
    label: "Cheat Sheet",
    detail: "Concise bullets for quick reference",
  },
  {
    value: "short",
    label: "Short Summary",
    detail: "Essential information only",
  },
]

export function StudyTools({
  materialId,
  ready,
  onOpenCitation,
  requestedTool,
  conversationId,
  selectedSourceIds,
  conversationReady = false,
  standaloneSet,
  availableSourceIds,
}: {
  materialId: string
  ready: boolean
  onOpenCitation: (page: number) => void
  requestedTool?: RequestedStudyTool | null
  conversationId?: string | null
  selectedSourceIds?: string[]
  conversationReady?: boolean
  standaloneSet?: StudySet
  availableSourceIds?: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedSet = searchParams.get("set")
  const selectedExam = searchParams.get("exam")
  const [sets, setSets] = useState<StudySet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [activeId, setActiveIdState] = useState<string | null>(
    standaloneSet?.id ?? selectedSet
  )
  const [detail, setDetail] = useState<StudySetDetail | null>(null)
  const [detailError, setDetailError] = useState("")
  const [generation, setGeneration] = useState<GenerationType | null>(null)
  const [quizSetupOpen, setQuizSetupOpen] = useState(false)
  const [noteSetupOpen, setNoteSetupOpen] = useState(false)
  const [outputSetup, setOutputSetup] = useState<StudyOutputType | null>(null)
  const [style, setStyle] = useState("detailed")
  const [count, setCount] = useState(10)
  const [creating, setCreating] = useState(false)
  const [generationError, setGenerationError] = useState("")
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState("")
  const [citationError, setCitationError] = useState("")
  const [pageStart, setPageStart] = useState("")
  const [pageEnd, setPageEnd] = useState("")
  const generationRequest = useRef<string | null>(null)
  const handledToolRequest = useRef<string | null>(null)
  const sourceIds = selectedSourceIds ?? [materialId]
  const sourceKey = sourceIds.join(",")
  const conversationBasis = sourceIds.length === 0 && !!conversationId
  const canGenerate =
    !standaloneSet &&
    (conversationBasis ? conversationReady : ready && sourceIds.length > 0)
  const activeListItem = sets.find((item) => item.id === activeId)

  const setActiveId = useCallback(
    (id: string | null) => {
      if (standaloneSet && !id) {
        router.push("/history#saved-study-sets")
        return
      }
      setActiveIdState(id)
      const url = new URL(window.location.href)
      if (id) url.searchParams.set("set", id)
      else url.searchParams.delete("set")
      url.searchParams.delete("review")
      window.history.replaceState(null, "", url)
    },
    [standaloneSet, router]
  )

  useEffect(
    () => setActiveIdState(standaloneSet?.id ?? selectedSet),
    [standaloneSet?.id, selectedSet]
  )

  useEffect(() => {
    if (standaloneSet) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const result = await studyRequest<{ studySets: StudySet[] }>(
          `/api/materials/${materialId}/study-sets`,
          { signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setSets(result.studySets)
        setError("")
        setLoading(false)
        if (
          result.studySets.some((item) =>
            ["queued", "generating"].includes(item.status)
          )
        )
          timer = setTimeout(load, 2000)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(studyError(cause))
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [materialId, refresh, selectedExam, selectedSet, standaloneSet])

  useEffect(() => {
    if (!activeId) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    setDetailError("")
    studyRequest<StudySetDetail>(`/api/study-sets/${activeId}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setDetail(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDetailError(studyError(cause))
      })
    return () => controller.abort()
  }, [activeId, activeListItem?.status, activeListItem?.updatedAt, refresh])

  const saved = useCallback((studySet: StudySet) => {
    setSets((current) =>
      current.map((item) => (item.id === studySet.id ? studySet : item))
    )
    setDetail((current) =>
      current?.studySet.id === studySet.id ? { ...current, studySet } : current
    )
  }, [])

  const openExam = useCallback(
    (id: string) => {
      const url = new URL(window.location.href)
      if (/^\/(spaces|materials)\//.test(url.pathname)) {
        url.searchParams.set("exam", id)
        url.searchParams.delete("set")
        url.searchParams.delete("review")
        url.searchParams.delete("attempt")
        if (id === "new") {
          url.searchParams.set("sourceIds", sourceKey)
          if (conversationId)
            url.searchParams.set("conversation", conversationId)
        }
        window.history.pushState(null, "", url)
      } else {
        const query = new URLSearchParams({ materialId, sourceIds: sourceKey })
        if (conversationId) query.set("conversationId", conversationId)
        router.push(
          id === "new" ? `/assessments/new?${query}` : `/assessments/${id}`
        )
      }
    },
    [materialId, sourceKey, conversationId, router]
  )

  function choose(id: string) {
    if (sets.find((item) => item.id === id)?.type === "exam") {
      openExam(id)
      return
    }
    setDetail(null)
    setDetailError("")
    setActionError("")
    setActiveId(id)
  }
  const configure = useCallback(
    (type: StudyToolType) => {
      setGenerationError("")
      generationRequest.current = null
      if (type === "notes") {
        setNoteSetupOpen(true)
        return
      }
      if (isStudyOutputType(type)) {
        setOutputSetup(type)
        return
      }
      if (type === "quiz") {
        setQuizSetupOpen(true)
        return
      }
      if (type === "exam") {
        openExam("new")
        return
      }
      setGeneration(type)
    },
    [openExam]
  )

  useEffect(() => {
    if (
      !requestedTool ||
      handledToolRequest.current === requestedTool.requestId
    )
      return
    handledToolRequest.current = requestedTool.requestId
    setActiveId(null)
    configure(requestedTool.type)
  }, [requestedTool, configure])

  async function createNote() {
    setCreating(true)
    setError("")
    try {
      const result = await studyRequest<{ studySet: StudySet }>(
        `/api/materials/${materialId}/study-sets`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "notes",
            title: "Untitled note",
            content: "",
          }),
        }
      )
      setSets((current) => [result.studySet, ...current])
      setNoteSetupOpen(false)
      choose(result.studySet.id)
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      setCreating(false)
    }
  }

  async function generate() {
    if (!generation || creating || !canGenerate) return
    setCreating(true)
    setGenerationError("")
    generationRequest.current ??= crypto.randomUUID()
    try {
      const result = await studyRequest<{
        studySetId: string
        jobId: string
        status: "queued"
      }>(`/api/materials/${materialId}/study-sets/generate`, {
        method: "POST",
        body: JSON.stringify({
          type: generation,
          style,
          count,
          sourceIds,
          ...(conversationId ? { conversationId } : {}),
          ...(!conversationBasis && pageStart
            ? { pageStart: Number(pageStart) }
            : {}),
          ...(!conversationBasis && pageEnd
            ? { pageEnd: Number(pageEnd) }
            : {}),
          requestId: generationRequest.current,
        }),
      })
      setGeneration(null)
      generationRequest.current = null
      choose(result.studySetId)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setGenerationError(studyError(cause))
    } finally {
      setCreating(false)
    }
  }

  const active = detail?.studySet
  const pending = active && ["queued", "generating"].includes(active.status)
  const saveUncertain = active?.errorCode === "generation_save_uncertain"
  const resultUnavailable =
    active?.errorCode === "generation_result_unavailable"
  const dataMissing = [
    "data_missing",
    "provider_data_missing",
    "timeline_evidence_mismatch",
    "chart_evidence_mismatch",
  ].includes(active?.errorCode ?? "")
  const missingTimelineData = dataMissing && active?.type === "timeline"
  const missingChartData =
    dataMissing &&
    (active?.type === "bar-chart" || active?.type === "line-chart")
  const missingDataTitle = missingTimelineData
    ? "No supported dates or stages were found"
    : missingChartData
      ? "No suitable numeric data was found"
      : "The input didn’t support the requested result"
  const missingDataDescription = missingTimelineData
    ? "This timeline needs a supported sequence of dates or stages. Choose input that contains the events you want to order."
    : missingChartData
      ? "This chart needs numbers supported by the selected input. Choose material or a conversation with the data you want to compare."
      : "Choose input with the details this result needs. No unsupported facts were added."
  const versionContent = detail?.version?.content
  const markdown =
    versionContent && "markdown" in versionContent
      ? (versionContent.markdown ?? active?.content ?? "")
      : (active?.content ?? "")
  const output =
    versionContent && "kind" in versionContent ? versionContent : null
  const invalidRange =
    [pageStart, pageEnd].some(
      (page) =>
        page &&
        (!Number.isInteger(Number(page)) ||
          Number(page) < 1 ||
          Number(page) > 200)
    ) ||
    (!!pageStart && !!pageEnd && Number(pageEnd) < Number(pageStart))
  function openCitation(citation: StudyCitation): void {
    if (
      availableSourceIds &&
      !availableSourceIds.includes(citation.material_id)
    ) {
      setCitationError(
        "This original material was removed. Your saved study set is still available."
      )
      return
    }
    setCitationError("")
    if (citation.material_id === materialId) onOpenCitation(citation.page)
    else router.push(`/materials/${citation.material_id}?page=${citation.page}`)
  }
  return (
    <div className="flex min-h-full flex-col gap-5 px-1 py-3">
      {citationError && (
        <p role="status" className="text-sm text-muted-foreground">
          {citationError}
        </p>
      )}
      {activeId ? (
        detailError ? (
          <Alert variant="destructive">
            <AlertTitle>This study set couldn’t load</AlertTitle>
            <AlertDescription>
              {detailError}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Retry
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveId(null)}
                >
                  Back to sets
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : !active ? (
          <div
            role="status"
            aria-label="Loading study set"
            className="flex flex-col gap-5"
          >
            <Skeleton className="h-7 w-2/3" />
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-5 w-full" />
            ))}
          </div>
        ) : active.type === "notes" ? (
          <StudyNote
            key={active.id}
            note={active}
            onSaved={saved}
            onBack={() => setActiveId(null)}
          />
        ) : pending ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit rounded-full"
              onClick={() => setActiveId(null)}
            >
              <NavArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Empty>
              <EmptyHeader>
                <Spinner className="mx-auto size-6" />
                <EmptyTitle>
                  Preparing your{" "}
                  {toolLabels[active.type]?.toLowerCase() ?? "study set"}
                </EmptyTitle>
                <EmptyDescription>
                  You can leave this tab and return. This saved set will open
                  when it’s ready.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Status check interrupted</AlertTitle>
                <AlertDescription>
                  {error}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-fit"
                    onClick={() => setRefresh((value) => value + 1)}
                  >
                    Check status again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : active.status === "failed" ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => setActiveId(null)}
            >
              <NavArrowLeft aria-hidden="true" />
              Back
            </Button>
            <Alert variant="destructive">
              <AlertTitle>
                {saveUncertain
                  ? "We couldn’t confirm the saved result"
                  : resultUnavailable
                    ? "This result couldn’t be saved"
                    : dataMissing
                      ? missingDataTitle
                      : "This set couldn’t be generated"}
              </AlertTitle>
              <AlertDescription className="flex flex-col items-start">
                {saveUncertain
                  ? "Your source is still available. Check this set’s status before generating another."
                  : resultUnavailable
                    ? "The result could not be saved. Generate again to create a new result."
                    : dataMissing
                      ? missingDataDescription
                      : "Your source is still available. You can try again when you’re ready."}
                <Button
                  variant="outline"
                  className="mt-3 w-fit"
                  disabled={Boolean(standaloneSet) && !saveUncertain}
                  onClick={() => {
                    if (saveUncertain) setRefresh((value) => value + 1)
                    else
                      configure(
                        active.type === "notes" ? "summary" : active.type
                      )
                  }}
                >
                  {saveUncertain
                    ? "Check status"
                    : resultUnavailable
                      ? "Generate again"
                      : "Try generation again"}
                </Button>
              </AlertDescription>
            </Alert>
          </>
        ) : active.type === "flashcards" ? (
          <StudyFlashcards
            key={detail.studySet.id}
            detail={detail}
            onChanged={(next) => {
              setDetail(next)
              saved(next.studySet)
            }}
            onBack={() => setActiveId(null)}
            onCitation={openCitation}
          />
        ) : active.type === "quiz" ? (
          <AssessmentSession
            key={active.id}
            studySetId={active.id}
            title={active.title}
            mode="quiz"
            onBack={() => setActiveId(null)}
            embedded={Boolean(standaloneSet)}
            onCitation={openCitation}
          />
        ) : active.type === "exam" ? (
          <Button
            onClick={() => openExam(active.id)}
            className="w-fit rounded-full"
          >
            Open exam
          </Button>
        ) : isStudyOutputType(active.type) ? (
          output && output.kind === active.type && detail.version ? (
            <StudyOutputView
              key={active.id}
              output={output}
              studySetId={active.id}
              versionId={detail.version.id}
              revision={active.revision}
              version={detail.version.version}
              artifact={detail.artifact}
              onBack={() => setActiveId(null)}
              onChanged={(next) => {
                setDetail(next)
                saved(next.studySet)
              }}
              onRenew={async () => {
                const next = await studyRequest<StudySetDetail>(
                  `/api/study-sets/${active.id}`
                )
                setDetail(next)
                saved(next.studySet)
                return next.artifact
              }}
              onCitation={openCitation}
            />
          ) : (
            <Alert variant="destructive">
              <AlertTitle>This output couldn’t be displayed</AlertTitle>
              <AlertDescription>
                The saved content is unavailable. Try loading it again.
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRefresh((value) => value + 1)}
                  >
                    Reload output
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveId(null)}
                  >
                    Back to sets
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveId(null)}
                className="rounded-full"
              >
                <NavArrowLeft aria-hidden="true" />
                Back
              </Button>
              <div className="ml-auto flex gap-1">
                <ShareOutputAction
                  studySetId={active.id}
                  versionId={detail.version?.id}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy summary"
                  onClick={async () => {
                    try {
                      setActionError("")
                      await navigator.clipboard.writeText(markdown)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    } catch {
                      setActionError(
                        "The summary couldn’t be copied. Try exporting it instead."
                      )
                    }
                  }}
                >
                  {copied ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Export summary as Markdown"
                  onClick={() => exportStudyMarkdown(active.title, markdown)}
                >
                  <Download aria-hidden="true" />
                </Button>
              </div>
            </div>
            {actionError && (
              <Alert variant="destructive">
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            <h2 className="text-xl font-medium tracking-tight">
              {active.title}
            </h2>
            <StudyText content={markdown} />
            {detail.version?.content.citations?.length ? (
              <StudyOutputSources
                citations={detail.version.content.citations}
                onCitation={openCitation}
              />
            ) : null}
          </>
        )
      ) : (
        <>
          <h2 className="text-sm text-muted-foreground">Generate</h2>
          <div className="-mt-3 grid grid-cols-2 gap-2.5">
            {generationTools.map(({ type, title, icon: Icon, chip }) => {
              return (
                <div
                  key={type}
                  className="group/generate-card flex min-w-0 items-center rounded-2xl border-2 border-border bg-background px-2.5 py-1 shadow-composer transition-[background-color,border-color,box-shadow] duration-150 hover:border-foreground/15 hover:bg-muted/35 has-[:focus-visible]:border-ring/50 motion-reduce:transition-none"
                >
                  <Button
                    variant="ghost"
                    disabled={(type !== "notes" && !canGenerate) || creating}
                    onClick={() =>
                      type === "notes" ? void createNote() : configure(type)
                    }
                    className="h-12 min-w-0 flex-1 justify-start gap-2.5 rounded-xl px-0 text-sm font-normal text-primary/80 hover:bg-transparent hover:text-primary/80 sm:text-base"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5",
                        chip
                      )}
                    >
                      {type === "notes" && creating ? (
                        <Spinner />
                      ) : (
                        <Icon aria-hidden="true" strokeWidth={2} />
                      )}
                    </span>
                    <span className="truncate">{title}</span>
                  </Button>
                  {type !== "notes" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canGenerate || creating}
                      aria-label={`${title} settings`}
                      onClick={() => configure(type)}
                      className="rounded-full text-muted-foreground/70 transition-colors duration-150 hover:bg-muted/70 hover:text-foreground motion-reduce:transition-none"
                    >
                      <Settings2 aria-hidden="true" strokeWidth={1.8} />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {!canGenerate && (
            <p className="text-sm text-muted-foreground">
              {conversationBasis
                ? "Send a question and wait for a completed answer to generate from this conversation. You can write a note now."
                : "Your selected material needs to finish processing before generating a study set. You can write a note now."}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-fit"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <h2 className="mt-4 text-lg">My Sets</h2>
          {loading ? (
            <div
              role="status"
              aria-label="Loading saved sets"
              className="flex flex-col gap-3"
            >
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-16 rounded-2xl" />
              ))}
            </div>
          ) : sets.length ? (
            <div className="flex flex-col gap-2">
              {sets.map((item) => {
                const Icon = Object.hasOwn(toolIcons, item.type)
                  ? toolIcons[item.type]
                  : Page
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    onClick={() => choose(item.id)}
                    className="h-auto min-h-16 justify-start gap-3 rounded-2xl px-3 py-3 text-left"
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {item.status === "queued"
                          ? "Queued"
                          : item.status === "generating"
                            ? "Generating…"
                            : item.status === "failed"
                              ? "Generation failed"
                              : (toolLabels[item.type] ?? "Study set")}
                      </span>
                    </span>
                    {["queued", "generating"].includes(item.status) && (
                      <Spinner />
                    )}
                  </Button>
                )
              })}
            </div>
          ) : (
            <Empty className="border-0 px-0">
              <EmptyHeader>
                <EmptyTitle>No study sets yet</EmptyTitle>
                <EmptyDescription>
                  Generate a study set or start a note.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </>
      )}
      <Dialog
        open={!!generation}
        onOpenChange={(open) => {
          if (!open && !creating) setGeneration(null)
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[12px] p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg leading-6">
              Generate {generation === "summary" ? "Summary" : "Flashcards"}
            </DialogTitle>
            <DialogDescription>
              {conversationBasis
                ? "Use the recent saved conversation to create a saved study set. No material citations will be added."
                : `Use ${sourceIds.length} selected material${sourceIds.length === 1 ? "" : "s"} to create a saved study set.`}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {generation === "summary" ? (
              <FieldSet>
                <FieldLegend>Templates</FieldLegend>
                <ToggleGroup
                  orientation="vertical"
                  value={[style]}
                  onValueChange={(values) => {
                    if (values[0]) {
                      setStyle(values[0])
                      generationRequest.current = null
                    }
                  }}
                  variant="outline"
                  className="w-full gap-2"
                >
                  {templates.map((item) => (
                    <ToggleGroupItem
                      key={item.value}
                      value={item.value}
                      className="h-auto justify-start rounded-xl p-3 text-left"
                    >
                      <span>
                        <span className="block">{item.label}</span>
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            ) : (
              <Field>
                <FieldLabel htmlFor="flashcard-count">
                  Number of flashcards
                </FieldLabel>
                <Input
                  id="flashcard-count"
                  type="number"
                  min={5}
                  max={30}
                  value={count}
                  onChange={(event) => {
                    setCount(Number(event.target.value))
                    generationRequest.current = null
                  }}
                  className="h-11"
                />
              </Field>
            )}
            {!conversationBasis && (
              <FieldSet>
                <FieldLegend>Pages (optional)</FieldLegend>
                <FieldGroup className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="generation-page-start">
                      From
                    </FieldLabel>
                    <Input
                      id="generation-page-start"
                      type="number"
                      min={1}
                      max={200}
                      placeholder="First page"
                      value={pageStart}
                      onChange={(event) => {
                        setPageStart(event.target.value)
                        generationRequest.current = null
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="generation-page-end">To</FieldLabel>
                    <Input
                      id="generation-page-end"
                      type="number"
                      min={1}
                      max={200}
                      placeholder="Last page"
                      value={pageEnd}
                      onChange={(event) => {
                        setPageEnd(event.target.value)
                        generationRequest.current = null
                      }}
                    />
                  </Field>
                </FieldGroup>
                <p className="text-xs text-muted-foreground">
                  For a long document, choose a smaller page range.
                </p>
              </FieldSet>
            )}
          </FieldGroup>
          {invalidRange && (
            <p role="alert" className="text-sm text-destructive">
              Choose pages from 1 to 200, with the last page after the first.
            </p>
          )}
          {generationError && (
            <Alert variant="destructive">
              <AlertDescription>{generationError}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              className="h-10 rounded-xl"
              disabled={creating}
              onClick={() => setGeneration(null)}
            >
              Cancel
            </Button>
            <Button
              className="h-10 rounded-xl"
              disabled={
                creating ||
                !canGenerate ||
                invalidRange ||
                (generation === "flashcards" &&
                  (!Number.isInteger(count) || count < 5 || count > 30))
              }
              onClick={() => void generate()}
            >
              {creating && <Spinner />}
              {creating ? "Starting generation…" : "Generate"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Generating a new set uses your study-set allowance. Opening it again
            is free.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={noteSetupOpen}
        onOpenChange={(open) => {
          if (!creating) setNoteSetupOpen(open)
        }}
      >
        <DialogContent
          className="rounded-2xl p-6 sm:max-w-md"
          showCloseButton={!creating}
        >
          <DialogHeader>
            <DialogTitle>Create a note</DialogTitle>
            <DialogDescription>
              Start a blank note. Your writing saves automatically, and no
              generation allowance is used.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            disabled={creating}
            className="rounded-full"
            onClick={() => void createNote()}
          >
            {creating && <Spinner />}Create note
          </Button>
        </DialogContent>
      </Dialog>
      {outputSetup && (
        <StudyOutputSetup
          key={`${outputSetup}:${sourceKey}:${conversationId ?? ""}`}
          type={outputSetup}
          materialId={materialId}
          sourceIds={sourceIds}
          conversationId={conversationId}
          canGenerate={canGenerate}
          onClose={() => setOutputSetup(null)}
          onCreated={(id) => {
            setOutputSetup(null)
            choose(id)
            setRefresh((value) => value + 1)
          }}
        />
      )}
      <AssessmentSetup
        key={`quiz:${sourceKey}:${conversationId ?? ""}`}
        mode="quiz"
        materialId={materialId}
        sources={sourceIds.map((id, index) => ({
          id,
          title:
            id === materialId
              ? "Current material"
              : `Selected material ${index + 1}`,
        }))}
        initialSourceIds={sourceIds}
        conversationId={conversationId}
        conversationReady={conversationReady}
        allowConversationBasis={conversationBasis}
        open={quizSetupOpen}
        onOpenChange={setQuizSetupOpen}
        onCancel={() => setQuizSetupOpen(false)}
        onCreated={(id) => {
          setQuizSetupOpen(false)
          choose(id)
          setRefresh((value) => value + 1)
        }}
      />
    </div>
  )
}
