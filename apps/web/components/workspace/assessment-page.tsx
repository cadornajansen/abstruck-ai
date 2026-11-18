"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { NavArrowLeft } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import type { AssessmentCitation } from "@/lib/assessment-types"
import { AssessmentSetup, type AssessmentSource } from "./assessment-setup"
import { AssessmentSession } from "./assessment-session"
import { studyRequest, studyError, type StudySet } from "./study-tools-types"

export interface AssessmentPageProps {
  initialStudySet?: StudySet
  studySetId?: string
  materialId: string | null
  sources?: AssessmentSource[]
  sourceTitle?: string
  initialAttemptId?: string
  initialDurationMinutes?: number | null
  initialCount?: number
  initialSourceIds?: string[]
  conversationId?: string | null
  conversationReady?: boolean
  allowConversationBasis?: boolean
  embedded?: boolean
  onBack?: () => void
  onCreated?: (studySetId: string) => void
  onCitation?: (citation: AssessmentCitation) => void
}

export function AssessmentPage({
  initialStudySet,
  studySetId,
  materialId,
  sources = [],
  sourceTitle,
  initialAttemptId,
  initialDurationMinutes,
  initialCount,
  initialSourceIds,
  conversationId,
  conversationReady,
  allowConversationBasis,
  embedded = false,
  onBack,
  onCreated,
  onCitation,
}: AssessmentPageProps) {
  const router = useRouter()
  const [loadedStudySet, setStudySet] = useState(initialStudySet)
  const [createdStudySetId, setCreatedStudySetId] = useState<string>()
  const requestedStudySetId =
    studySetId ?? createdStudySetId ?? initialStudySet?.id
  const studySet =
    loadedStudySet?.id === requestedStudySetId ? loadedStudySet : undefined
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes)
  const [questionCount, setQuestionCount] = useState(initialCount)
  const backHref = materialId
    ? `/materials/${materialId}${conversationId ? `?conversation=${conversationId}` : ""}`
    : "/library"

  function back() {
    if (onBack) onBack()
    else router.push(backHref)
  }

  function created(id: string) {
    setCreatedStudySetId(id)
    onCreated?.(id)
    if (!embedded && !onCreated) router.replace(`/assessments/${id}`)
  }

  useEffect(() => {
    if (!requestedStudySetId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const result = await studyRequest<{
          studySet: StudySet
          version?: { settings: Record<string, unknown> } | null
        }>(`/api/study-sets/${requestedStudySetId}`, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        if (result.studySet.type !== "exam")
          throw new Error("This saved set is not an exam.")
        setStudySet(result.studySet)
        setDurationMinutes(
          typeof result.version?.settings.durationMinutes === "number"
            ? result.version.settings.durationMinutes
            : null
        )
        setQuestionCount(
          typeof result.version?.settings.count === "number"
            ? result.version.settings.count
            : undefined
        )
        setError("")
        if (["queued", "generating"].includes(result.studySet.status))
          timer = setTimeout(load, 2000)
      } catch (cause) {
        if (!controller.signal.aborted) setError(studyError(cause))
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [requestedStudySetId, retry])

  if (studySet?.status === "ready")
    return (
      <AssessmentSession
        key={studySet.id}
        studySetId={studySet.id}
        title={studySet.title}
        mode="exam"
        initialAttemptId={initialAttemptId}
        durationMinutes={durationMinutes}
        questionCount={questionCount}
        embedded={embedded}
        onBack={back}
        onCitation={
          onCitation ??
          ((citation) =>
            router.push(
              `/materials/${citation.material_id}?page=${citation.page}`
            ))
        }
      />
    )

  const pending =
    requestedStudySetId &&
    !error &&
    (!studySet || ["queued", "generating"].includes(studySet.status))
  const uncertain = studySet?.errorCode === "generation_save_uncertain"

  return (
    <div
      className={cn(
        "bg-background",
        embedded ? "flex min-h-0 flex-1 flex-col" : "min-h-svh"
      )}
    >
      {!embedded && (
        <header className="flex h-14 items-center gap-4 border-b px-4 sm:px-6">
          <Button variant="ghost" size="sm" onClick={back}>
            <NavArrowLeft data-icon="inline-start" />
            Back to {materialId ? "material" : "library"}
          </Button>
        </header>
      )}
      <div
        className={cn(
          "w-full px-5 py-8 sm:px-8 sm:py-10",
          embedded && "min-h-0 flex-1 overflow-y-auto"
        )}
      >
        {!requestedStudySetId ? (
          <section className="mx-auto w-full max-w-[640px]">
            <h1 className="text-center text-[28px] leading-tight font-normal sm:text-[30px]">
              Create a New Exam
            </h1>
            <p className="mt-2 text-center text-base text-muted-foreground">
              Configure your exam settings
            </p>
            <div className="mt-7">
              <AssessmentSetup
                mode="exam"
                materialId={materialId ?? ""}
                sources={sources}
                sourceTitle={sourceTitle}
                initialSourceIds={initialSourceIds}
                conversationId={conversationId}
                conversationReady={conversationReady}
                allowConversationBasis={allowConversationBasis}
                onCreated={created}
                onCancel={back}
              />
            </div>
          </section>
        ) : pending ? (
          <Empty className="my-12 border-0">
            <EmptyHeader>
              <Spinner className="mx-auto size-7" />
              <EmptyTitle>Preparing your exam</EmptyTitle>
              <EmptyDescription>
                Your saved exam will be ready here. You can leave and return
                without generating it again.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Alert variant="destructive" className="mx-auto max-w-[640px]">
            <AlertTitle>
              {error
                ? "We couldn’t check this exam"
                : uncertain
                  ? "We couldn’t confirm the saved result"
                  : "This exam couldn’t be saved"}
            </AlertTitle>
            <AlertDescription className="mt-2 flex flex-col items-start gap-3">
              <p>
                {error ||
                  (uncertain
                    ? "Check this exam’s status before generating another."
                    : "Your materials are still available. Create a new exam to try again.")}
              </p>
              {uncertain || error ? (
                <Button
                  variant="outline"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Check status
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (embedded) back()
                    else
                      router.push(
                        `/assessments/new${materialId ? `?materialId=${materialId}` : ""}`
                      )
                  }}
                >
                  {embedded ? "Back" : "Create a new exam"}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
