"use client"

import { Refresh } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import type {
  AssessmentAttempt,
  AssessmentCitation,
} from "@/lib/assessment-types"
import {
  AssessmentFields,
  AssessmentFeedbackView,
  hasAssessmentResponse,
} from "./assessment-question"
import { questionTypeLabels } from "./assessment-setup"

export function assessmentDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, "0")}`
}

export function AssessmentResults({
  attempt,
  reviewing,
  busy,
  compact,
  onReview,
  onRetake,
  onCitation,
  onRequestReview,
  onRefresh,
}: {
  attempt: AssessmentAttempt
  reviewing: boolean
  busy: boolean
  compact: boolean
  onReview: (reviewing: boolean) => void
  onRetake: () => void
  onCitation: (citation: AssessmentCitation) => void
  onRequestReview: (questionId: string) => void
  onRefresh: () => void
}) {
  const skipped = attempt.questions.filter(
    (question) =>
      !hasAssessmentResponse(
        attempt.answers.find((answer) => answer.questionId === question.id)
          ?.response ?? {}
      )
  ).length
  const percent =
    attempt.score !== null && attempt.maxScore > 0
      ? Math.round((attempt.score / attempt.maxScore) * 100)
      : null
  const elapsed = attempt.submittedAt
    ? Math.max(
        0,
        (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt)) / 1000
      )
    : null

  if (reviewing)
    return (
      <div className="flex min-h-full flex-col">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[760px] flex-1 flex-col gap-16 px-6 py-8",
            compact && "gap-8 px-0 py-4"
          )}
        >
          {attempt.questions.map((question) => {
            const answer = attempt.answers.find(
              (item) => item.questionId === question.id
            )
            return (
              <section key={question.id} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {question.position}. {questionTypeLabels[question.type]}
                </p>
                <h2 className="text-base leading-7 font-normal">
                  {question.text}
                </h2>
                <AssessmentFields
                  question={question}
                  response={answer?.response ?? {}}
                  answer={answer}
                  disabled
                  showFeedback
                  onChange={() => {}}
                />
                {answer?.feedback ? (
                  <AssessmentFeedbackView
                    answer={answer}
                    busy={busy}
                    onCitation={onCitation}
                    onRequestReview={() => onRequestReview(question.id)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Feedback is being prepared.
                  </p>
                )}
              </section>
            )
          })}
        </div>
        <div
          className={cn(
            "sticky bottom-0 border-t bg-background px-6 py-4",
            compact && "static px-0"
          )}
        >
          <Button
            className="mx-auto flex h-12 w-full max-w-sm rounded-full"
            onClick={() => onReview(false)}
          >
            View Results
          </Button>
        </div>
      </div>
    )

  return (
    <div className="flex min-h-full flex-col">
      <section
        className={cn(
          "mx-auto flex w-full max-w-[848px] flex-1 flex-col items-center gap-6 px-6 py-12 text-center",
          compact && "px-0 py-6"
        )}
      >
        <h2 className="text-xl leading-8 font-medium">
          {attempt.state === "grading"
            ? "Your results are being prepared"
            : attempt.mode === "exam"
              ? "Your exam results"
              : "Quiz complete"}
        </h2>
        {attempt.state === "grading" ? (
          <>
            <Spinner className="size-8" />
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Your answers are saved. Written responses are being checked; you
              can leave and return to these results.
            </p>
            <Button variant="outline" onClick={onRefresh} disabled={busy}>
              Check status
            </Button>
          </>
        ) : (
          <>
            <div className="flex size-30 flex-col items-center justify-center rounded-full border-[6px] border-muted">
              <span className="text-2xl font-medium">
                {percent === null ? "—" : `${percent}%`}
              </span>
              <span className="text-sm text-muted-foreground">Score</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {attempt.score ?? "—"} / {attempt.maxScore} points · {skipped}{" "}
              skipped
              {elapsed !== null ? ` · ${assessmentDuration(elapsed)}` : ""}
            </p>
            {!!attempt.reviewCount && (
              <Badge variant="secondary">
                {attempt.reviewCount}{" "}
                {attempt.reviewCount === 1 ? "answer needs" : "answers need"}{" "}
                review
              </Badge>
            )}
            <Button variant="link" onClick={() => onReview(true)}>
              Review answers
            </Button>
            <dl className="grid w-full grid-cols-3 gap-3 rounded-[16px] border p-5 text-sm">
              <div>
                <dt className="text-muted-foreground">Correct</dt>
                <dd className="mt-2 text-lg font-medium">
                  {
                    attempt.answers.filter(
                      (answer) => answer.feedback?.status === "correct"
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Incorrect</dt>
                <dd className="mt-2 text-lg font-medium">
                  {
                    attempt.answers.filter(
                      (answer) =>
                        answer.feedback?.status === "incorrect" &&
                        hasAssessmentResponse(answer.response)
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Skipped</dt>
                <dd className="mt-2 text-lg font-medium">{skipped}</dd>
              </div>
            </dl>
          </>
        )}
        {attempt.aiGrading && (
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            Written responses use AI rubric feedback. Review the explanation and
            request a review if it does not match your work.{" "}
            {attempt.aiAttemptsRemaining} of {attempt.aiAttemptLimit} AI-graded
            attempts remain for this period.
          </p>
        )}
      </section>
      {attempt.state === "completed" && (
        <div
          className={cn(
            "sticky bottom-0 border-t bg-background p-4",
            compact && "static px-0"
          )}
        >
          <div className="mx-auto grid w-full max-w-[784px] gap-3 sm:grid-cols-2">
            <Button
              className="h-12 rounded-full"
              disabled={busy}
              onClick={onRetake}
            >
              <Refresh data-icon="inline-start" />
              Try Again
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-full"
              onClick={() => onReview(true)}
            >
              Review Answers
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
