"use client"

import { useEffect, useRef, useState } from "react"
import { Bookmark, NavArrowLeft, NavArrowRight, Xmark } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import type {
  AssessmentCitation,
  AssessmentQuestion,
  AssessmentResponse,
} from "@/lib/assessment-types"
import { useAssessmentAttempt } from "./assessment-attempt"
import {
  AssessmentFields,
  AssessmentFeedbackView,
  hasAssessmentResponse,
} from "./assessment-question"
import { AssessmentResults, assessmentDuration } from "./assessment-results"
import { questionTypeLabels } from "./assessment-setup"
import { ShareOutputAction } from "./sharing-dialog"

export function AssessmentSession({
  studySetId,
  title,
  mode,
  initialAttemptId,
  durationMinutes,
  questionCount,
  embedded = false,
  onBack,
  onCitation,
}: {
  studySetId: string
  title: string
  mode: "quiz" | "exam"
  initialAttemptId?: string
  durationMinutes?: number | null
  questionCount?: number
  embedded?: boolean
  onBack: () => void
  onCitation: (citation: AssessmentCitation) => void
}) {
  const data = useAssessmentAttempt(studySetId, initialAttemptId)
  const [index, setIndex] = useState(0)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [checkingQuestion, setCheckingQuestion] = useState<string | null>(null)
  const questionRefs = useRef<Record<string, HTMLElement | null>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const attempt = data.attempt
  const active = attempt?.state === "active"
  const fullPage = mode === "exam"
  const currentQuestion = attempt?.questions[index]
  const locked = data.busy || data.remainingSeconds === 0

  useEffect(() => {
    if (!attempt) return
    const next = attempt.questions.findIndex(
      (question) =>
        !attempt.answers.some(
          (answer) => answer.questionId === question.id && answer.final
        )
    )
    setIndex(Math.max(0, next))
    setReviewing(false)
  }, [attempt?.attemptId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [attempt?.attemptId, attempt?.state, reviewing])

  function responseFor(questionId: string): AssessmentResponse {
    const saved = attempt?.answers.find(
      (answer) => answer.questionId === questionId
    )
    return saved?.final
      ? saved.response
      : (data.drafts[questionId]?.response ?? saved?.response ?? {})
  }

  const answeredCount =
    attempt?.questions.filter((question) =>
      hasAssessmentResponse(responseFor(question.id))
    ).length ?? 0
  const unansweredCount = (attempt?.questions.length ?? 0) - answeredCount
  const savedStatus = data.saving
    ? "Saving…"
    : data.error
      ? "Not saved"
      : Object.keys(data.drafts).length
        ? "Unsaved changes"
        : "Saved"

  async function back(): Promise<void> {
    if (!active || (await data.flush())) onBack()
  }

  function change(question: AssessmentQuestion, response: AssessmentResponse) {
    data.change(question.id, response)
    if (
      mode === "quiz" &&
      ["multiple_choice", "true_false"].includes(question.type) &&
      hasAssessmentResponse(response)
    )
      void checkAnswer(question.id)
  }

  async function checkAnswer(questionId: string): Promise<void> {
    if (checkingQuestion) return
    setCheckingQuestion(questionId)
    try {
      await data.saveQuestion(questionId, true)
    } finally {
      setCheckingQuestion(null)
    }
  }

  function jump(questionId: string) {
    setNavigationOpen(false)
    questionRefs.current[questionId]?.scrollIntoView({
      block: "start",
      behavior: "auto",
    })
  }

  const error = data.error && (
    <Alert variant="destructive" className="mx-auto w-full max-w-[712px]">
      <AlertDescription className="flex flex-col items-start gap-3">
        {data.error}
        <div className="flex flex-wrap gap-2">
          {Object.keys(data.drafts).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={data.busy || data.saving}
              onClick={() => void data.flush()}
            >
              Retry save
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={data.busy}
            onClick={() => void data.refresh()}
          >
            Check connection
          </Button>
          {data.objectiveAvailable && (
            <Button
              size="sm"
              disabled={data.busy}
              onClick={() => void data.start(true)}
            >
              Practise objective questions
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )

  let content
  if (data.loading)
    content = (
      <div
        role="status"
        aria-label="Loading assessment"
        className="mx-auto flex w-full max-w-[712px] flex-col gap-5 p-6"
      >
        <Skeleton className="h-6 w-2/3" />
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full rounded-[16px]" />
        ))}
      </div>
    )
  else if (!attempt)
    content = !data.error && (
      <Empty className="mx-auto my-10 max-w-lg border-0">
        <EmptyHeader>
          <EmptyTitle>
            {mode === "exam" ? "Ready for your exam?" : "Your quiz is ready"}
          </EmptyTitle>
          <EmptyDescription>
            {mode === "exam"
              ? "Your answers save automatically. Correct answers and feedback stay hidden until you submit. The time limit starts when you begin."
              : "Check each answer for feedback. Your answers and progress save as you practise."}
          </EmptyDescription>
        </EmptyHeader>
        {mode === "exam" && (
          <p className="text-sm text-muted-foreground">
            {questionCount ? `${questionCount} questions · ` : ""}
            {durationMinutes
              ? `${durationMinutes} minute time limit`
              : "No time limit"}
          </p>
        )}
        <Button
          disabled={data.busy}
          onClick={() => void data.start()}
          className="h-11 rounded-full px-6"
        >
          {data.busy && <Spinner data-icon="inline-start" />}
          {mode === "exam" ? "Start Exam" : "Start Quiz"}
        </Button>
      </Empty>
    )
  else if (!active)
    content = (
      <AssessmentResults
        attempt={attempt}
        reviewing={reviewing}
        compact={!fullPage}
        busy={data.busy}
        onReview={setReviewing}
        onRetake={() => void data.start()}
        onCitation={onCitation}
        onRequestReview={(id) => void data.requestReview(id)}
        onRefresh={() => void data.refresh()}
      />
    )
  else if (fullPage)
    content = (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-24 px-6 py-12 sm:py-16">
        {attempt.questions.map((question, questionIndex) => {
          const answer = attempt.answers.find(
            (item) => item.questionId === question.id
          )
          const marked =
            data.drafts[question.id]?.marked ?? answer?.marked ?? false
          return (
            <section
              key={question.id}
              ref={(element) => {
                questionRefs.current[question.id] = element
              }}
              className="flex scroll-mt-6 flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>
                  {question.position}. {questionTypeLabels[question.type]}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={marked}
                    disabled={locked}
                    onClick={() =>
                      data.change(
                        question.id,
                        responseFor(question.id),
                        !marked
                      )
                    }
                  >
                    <Bookmark
                      data-icon="inline-start"
                      className={cn(marked && "fill-current")}
                    />
                    {marked ? "Marked" : "Mark"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const next = attempt.questions[questionIndex + 1]
                      if (next) jump(next.id)
                      else setNavigationOpen(true)
                    }}
                  >
                    Skip
                    <NavArrowRight data-icon="inline-end" />
                  </Button>
                </div>
              </div>
              <h2 className="text-base leading-7 font-normal">
                {question.text}
              </h2>
              <AssessmentFields
                question={question}
                response={responseFor(question.id)}
                answer={answer}
                disabled={locked}
                showFeedback={false}
                onChange={(response) => change(question, response)}
              />
            </section>
          )
        })}
      </div>
    )
  else if (currentQuestion) {
    const answer = attempt.answers.find(
      (item) => item.questionId === currentQuestion.id
    )
    const response = responseFor(currentQuestion.id)
    content = (
      <div className="flex flex-col gap-5 py-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{index + 1}</span>
          <Progress
            value={
              (attempt.answers.filter((item) => item.final).length /
                attempt.questions.length) *
              100
            }
            aria-label="Quiz progress"
            className="flex-1 [&_[data-slot=progress-indicator]]:bg-plan-foreground"
          />
          <span>{attempt.questions.length}</span>
        </div>
        <h2 className="pt-2 text-base leading-7 font-normal">
          {currentQuestion.text}
        </h2>
        <AssessmentFields
          question={currentQuestion}
          response={response}
          answer={answer}
          disabled={
            locked || checkingQuestion === currentQuestion.id || !!answer?.final
          }
          showFeedback={!!answer?.final}
          onChange={(next) => change(currentQuestion, next)}
        />
        {answer?.final ? (
          answer.feedback ? (
            <AssessmentFeedbackView
              answer={answer}
              busy={data.busy}
              onCitation={onCitation}
              onRequestReview={() =>
                void data.requestReview(currentQuestion.id)
              }
            />
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Checking your answer…
            </p>
          )
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={locked || !!checkingQuestion}
              onClick={() => {
                data.change(currentQuestion.id, {})
                void checkAnswer(currentQuestion.id)
              }}
            >
              Don’t know
            </Button>
            {!["multiple_choice", "true_false"].includes(
              currentQuestion.type
            ) && (
              <Button
                disabled={
                  locked ||
                  !!checkingQuestion ||
                  !hasAssessmentResponse(response)
                }
                onClick={() => void checkAnswer(currentQuestion.id)}
              >
                {checkingQuestion === currentQuestion.id
                  ? "Checking…"
                  : "Check answer"}
              </Button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={index === 0 || data.busy}
            onClick={() => setIndex((value) => value - 1)}
            className="rounded-full"
          >
            <NavArrowLeft data-icon="inline-start" />
            Previous
          </Button>
          <Button
            disabled={!answer?.final || locked}
            onClick={() => {
              if (index === attempt.questions.length - 1) void data.submit()
              else setIndex((value) => value + 1)
            }}
            className="rounded-full"
          >
            {index === attempt.questions.length - 1 ? "View results" : "Next"}
            <NavArrowRight data-icon="inline-end" />
          </Button>
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {savedStatus}
        </p>
      </div>
    )
  }

  const historyButton = (
    <Button
      variant="ghost"
      size="sm"
      disabled={data.busy || data.history.length === 0}
      onClick={() => setHistoryOpen(true)}
      className="max-w-full truncate"
    >
      Past attempts
    </Button>
  )

  return (
    <div
      className={cn(
        "flex flex-col",
        fullPage && "min-h-0 bg-background",
        fullPage && (embedded ? "h-full flex-1" : "h-svh"),
        !fullPage && "min-h-full gap-4"
      )}
    >
      {fullPage ? (
        <header className="grid min-h-18 shrink-0 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close exam"
            disabled={data.busy}
            onClick={() => void back()}
          >
            <Xmark />
          </Button>
          {active ? (
            <div className="mx-auto flex w-full max-w-[712px] items-center gap-3 text-sm text-muted-foreground">
              <span>
                {answeredCount}/{attempt.questions.length}
              </span>
              <Progress
                value={
                  (answeredCount / Math.max(1, attempt.questions.length)) * 100
                }
                aria-label="Exam answer progress"
                className="flex-1"
              />
            </div>
          ) : (
            <div className="mx-auto min-w-0 truncate text-sm font-medium">
              {title}
            </div>
          )}
          {active && data.remainingSeconds !== null ? (
            <span
              role="timer"
              aria-label="Time remaining"
              className="text-sm tabular-nums"
            >
              {assessmentDuration(data.remainingSeconds)}
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {historyButton}
              {!active && (
                <ShareOutputAction
                  studySetId={studySetId}
                  versionId={attempt?.versionId}
                  disabled={data.busy || data.loading}
                />
              )}
            </div>
          )}
        </header>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={data.busy}
            onClick={() => void back()}
            className="rounded-full"
          >
            <NavArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <div className="flex items-center gap-1">
            {historyButton}
            {!active && (
              <ShareOutputAction
                studySetId={studySetId}
                versionId={attempt?.versionId}
                disabled={data.busy || data.loading}
              />
            )}
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        className={
          fullPage ? "min-h-0 flex-1 overflow-y-auto" : "flex flex-col gap-4"
        }
      >
        {error && <div className={fullPage ? "p-4" : undefined}>{error}</div>}
        {active && data.remainingSeconds === 0 && (
          <Alert className="mx-auto mt-4 max-w-[712px]">
            <AlertDescription>
              Checking the exam deadline. Your saved answers will be used.
            </AlertDescription>
          </Alert>
        )}
        {content}
      </div>
      {fullPage && active && (
        <footer className="shrink-0 border-t bg-background p-4">
          <div className="mx-auto grid w-full max-w-[784px] grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => setNavigationOpen(true)}
              className="h-12 rounded-full"
            >
              Review Answers
            </Button>
            <Button
              disabled={locked}
              onClick={() => setConfirmSubmit(true)}
              className="h-12 rounded-full"
            >
              Submit Exam
            </Button>
          </div>
          <p
            role="status"
            className="mt-2 text-center text-xs text-muted-foreground"
          >
            {savedStatus}
          </p>
        </footer>
      )}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[16px]">
          <DialogHeader>
            <DialogTitle>Past attempts</DialogTitle>
            <DialogDescription>
              Each attempt keeps its original questions and saved results.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {data.history.map((item) => (
              <Button
                key={item.attemptId}
                variant="outline"
                disabled={data.busy}
                onClick={async () => {
                  await data.openAttempt(item.attemptId)
                  setHistoryOpen(false)
                }}
                className="h-auto justify-between gap-4 rounded-xl px-4 py-3 text-left"
              >
                <span>
                  {new Date(item.startedAt).toLocaleString()}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {item.state === "active"
                      ? "In progress"
                      : item.state === "grading"
                        ? "Grading"
                        : "Completed"}
                  </span>
                </span>
                <span>
                  {item.score === null ? "—" : `${item.score}/${item.maxScore}`}
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-[16px]">
          <DialogHeader>
            <DialogTitle>Review your answers</DialogTitle>
            <DialogDescription>
              Choose a question to return to it before submitting.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {attempt?.questions.map((question) => {
              const marked =
                data.drafts[question.id]?.marked ??
                attempt.answers.find(
                  (answer) => answer.questionId === question.id
                )?.marked
              return (
                <Button
                  key={question.id}
                  variant="outline"
                  onClick={() => jump(question.id)}
                  className="h-auto justify-between gap-3 rounded-xl p-3 text-left"
                >
                  <span className="min-w-0 truncate">
                    {question.position}. {question.text}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {marked && <Badge variant="secondary">Marked</Badge>}
                    <Badge variant="outline">
                      {hasAssessmentResponse(responseFor(question.id))
                        ? "Answered"
                        : "Unanswered"}
                    </Badge>
                  </span>
                </Button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmSubmit}
        onOpenChange={(next) => {
          if (!data.busy) setConfirmSubmit(next)
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-[16px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your exam?</AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredCount
                ? `You have ${unansweredCount} unanswered ${unansweredCount === 1 ? "question" : "questions"}. `
                : ""}
              Your saved answers will be submitted. You cannot change them
              afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={data.busy}>
              Keep working
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={data.busy}
              onClick={async () => {
                if (await data.submit()) setConfirmSubmit(false)
              }}
            >
              {data.busy && <Spinner data-icon="inline-start" />}Submit Exam
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
