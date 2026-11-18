"use client"

import { Check, Xmark } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Badge } from "@workspace/ui/components/badge"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@workspace/ui/components/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"
import type {
  AssessmentAnswer,
  AssessmentCitation,
  AssessmentQuestion,
  AssessmentResponse,
} from "@/lib/assessment-types"

export function hasAssessmentResponse(response: AssessmentResponse): boolean {
  return !!response.text?.trim() || !!response.selectedOptionIds?.length
}

export function AssessmentFields({
  question,
  response,
  answer,
  disabled,
  showFeedback,
  onChange,
}: {
  question: AssessmentQuestion
  response: AssessmentResponse
  answer?: AssessmentAnswer
  disabled: boolean
  showFeedback: boolean
  onChange: (response: AssessmentResponse) => void
}) {
  const selected = response.selectedOptionIds ?? []
  const correct = showFeedback ? (answer?.correctOptionIds ?? []) : []
  const choiceClass = (id: string) =>
    cn(
      "min-h-12 w-full justify-start gap-3 rounded-[16px] border px-4 py-3 text-left text-sm leading-6 font-normal whitespace-normal",
      correct.includes(id) &&
        "border-plan-foreground bg-plan/40 text-foreground",
      showFeedback &&
        answer?.feedback?.status === "incorrect" &&
        selected.includes(id) &&
        !correct.includes(id) &&
        "border-destructive bg-destructive/5",
      disabled && "disabled:opacity-100"
    )

  if (question.options.length && question.type !== "multi_select") {
    return (
      <ToggleGroup
        orientation="vertical"
        value={selected}
        disabled={disabled}
        onValueChange={(values) => onChange({ selectedOptionIds: values })}
        aria-label={`Answer choices for question ${question.position}`}
        className="w-full gap-2"
      >
        {question.options.map((option, index) => (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            variant="outline"
            className={cn("h-auto", choiceClass(option.id))}
          >
            <span
              className="w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            >
              {correct.includes(option.id) ? (
                <Check />
              ) : showFeedback &&
                selected.includes(option.id) &&
                answer?.feedback?.status === "incorrect" ? (
                <Xmark />
              ) : (
                `${String.fromCharCode(65 + index)}.`
              )}
            </span>
            <span>{option.text}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  if (question.type === "multi_select") {
    return (
      <FieldSet>
        <FieldLegend className="sr-only">
          Select all answers that apply
        </FieldLegend>
        <FieldGroup className="gap-2">
          {question.options.map((option) => (
            <Field
              key={option.id}
              orientation="horizontal"
              className={cn(choiceClass(option.id), "items-start")}
            >
              <Checkbox
                id={`assessment-${question.id}-${option.id}`}
                checked={selected.includes(option.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    selectedOptionIds: checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  })
                }
                className="mt-1"
              />
              <FieldLabel
                htmlFor={`assessment-${question.id}-${option.id}`}
                className="flex-1 leading-6 font-normal"
              >
                {option.text}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
    )
  }

  return (
    <Field>
      <FieldLabel
        htmlFor={`assessment-response-${question.id}`}
        className="sr-only"
      >
        Your answer to question {question.position}
      </FieldLabel>
      {question.type === "free_response" ? (
        <Textarea
          id={`assessment-response-${question.id}`}
          value={response.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
          disabled={disabled}
          maxLength={2000}
          placeholder="Explain in your own words…"
          className="min-h-36 rounded-[16px] p-4 text-sm leading-6"
        />
      ) : (
        <Input
          id={`assessment-response-${question.id}`}
          value={response.text ?? ""}
          onChange={(event) => onChange({ text: event.target.value })}
          disabled={disabled}
          maxLength={2000}
          placeholder="Type your answer"
          className="h-12 rounded-xl"
        />
      )}
      {!disabled && (
        <FieldDescription className="text-xs">
          {(response.text ?? "").length.toLocaleString()} / 2,000 characters
        </FieldDescription>
      )}
    </Field>
  )
}

export function AssessmentFeedbackView({
  answer,
  onCitation,
  onRequestReview,
  busy = false,
}: {
  answer: AssessmentAnswer
  onCitation: (citation: AssessmentCitation) => void
  onRequestReview: () => void
  busy?: boolean
}) {
  const feedback = answer.feedback
  if (!feedback) return null
  const skipped = !hasAssessmentResponse(answer.response)
  const title = skipped
    ? "Skipped"
    : feedback.status === "correct"
      ? "Correct"
      : feedback.status === "incorrect"
        ? "Not quite"
        : feedback.status === "pending"
          ? "Feedback pending"
          : "Needs review"

  return (
    <Alert
      className={cn(
        "rounded-[16px] p-4",
        feedback.status === "correct" && "border-plan-foreground/30 bg-plan/60"
      )}
    >
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {title}
        {feedback.isAI && <Badge variant="secondary">AI rubric feedback</Badge>}
      </AlertTitle>
      <AlertDescription className="mt-2 flex flex-col items-start gap-3 leading-6">
        {feedback.text && <p>{feedback.text}</p>}
        {answer.explanation && answer.explanation !== feedback.text && (
          <p>{answer.explanation}</p>
        )}
        {!!answer.acceptedAnswers?.length && (
          <p>Accepted answer: {answer.acceptedAnswers.join(" or ")}</p>
        )}
        {answer.sampleAnswer && (
          <p>
            <span className="font-medium">Example response: </span>
            {answer.sampleAnswer}
          </p>
        )}
        {!!answer.citations.length && (
          <div className="flex flex-wrap gap-2" aria-label="Answer sources">
            {answer.citations.map((citation, index) => (
              <Button
                key={`${citation.segment_id}-${index}`}
                variant="secondary"
                size="xs"
                onClick={() => onCitation(citation)}
                className="rounded-full"
              >
                p. {citation.page}
              </Button>
            ))}
          </div>
        )}
        {feedback.status !== "pending" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || answer.reviewRequested}
            onClick={onRequestReview}
          >
            {answer.reviewRequested ? "Review requested" : "Request review"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
