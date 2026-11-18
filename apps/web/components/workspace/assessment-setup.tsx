"use client"

import { useRef, useState, type FormEvent } from "react"
import {
  CheckSquare,
  ListSelect,
  NavArrowLeft,
  Page,
  SwitchOn,
  Text,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { QUESTION_TYPES, type QuestionType } from "@/lib/assessment-types"
import { studyError, studyRequest } from "./study-tools-types"
import {
  AssessmentSourcePicker,
  type AssessmentSource,
} from "./assessment-source-picker"

export type { AssessmentSource } from "./assessment-source-picker"

export const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  multi_select: "Multi Select",
  true_false: "True or False",
  fill_blank: "Fill in the blank",
  free_response: "Free Response",
}

const questionTypeOptions = [
  { type: "multiple_choice", icon: CheckSquare },
  { type: "multi_select", icon: ListSelect },
  { type: "free_response", icon: Page },
  { type: "true_false", icon: SwitchOn },
  { type: "fill_blank", icon: Text },
] satisfies { type: QuestionType; icon: typeof CheckSquare }[]

interface AssessmentSetupProps {
  mode: "quiz" | "exam"
  materialId: string
  sources: AssessmentSource[]
  sourceTitle?: string
  initialSourceIds?: string[]
  conversationId?: string | null
  conversationReady?: boolean
  allowConversationBasis?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCreated: (studySetId: string) => void
  onCancel: () => void
}

export function AssessmentSetup({
  mode,
  materialId,
  sources,
  sourceTitle,
  initialSourceIds,
  conversationId,
  conversationReady = false,
  allowConversationBasis = false,
  open,
  onOpenChange,
  onCreated,
  onCancel,
}: AssessmentSetupProps) {
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([
    "multiple_choice",
  ])
  const [count, setCount] = useState(mode === "exam" ? 20 : 10)
  const [duration, setDuration] = useState("")
  const [sourceIds, setSourceIds] = useState<string[]>(
    () =>
      initialSourceIds ??
      (sources.some((source) => source.id === materialId)
        ? [materialId]
        : sources.slice(0, 1).map((source) => source.id))
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const requestId = useRef<string | null>(null)
  const maximumCount = mode === "exam" ? 40 : 20
  const invalid =
    !Number.isInteger(count) ||
    count < 5 ||
    count > maximumCount ||
    !questionTypes.length ||
    (!sourceIds.length &&
      !(allowConversationBasis && conversationId && conversationReady)) ||
    (duration !== "" &&
      (!Number.isInteger(Number(duration)) ||
        Number(duration) < 1 ||
        Number(duration) > 180))

  function changed() {
    requestId.current = null
    setError("")
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || invalid) return
    setPending(true)
    setError("")
    requestId.current ??= crypto.randomUUID()
    try {
      const result = await studyRequest<{ studySetId: string }>(
        `/api/materials/${conversationId ? materialId : sourceIds[0]}/study-sets/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            type: mode,
            sourceIds,
            ...(conversationId ? { conversationId } : {}),
            questionTypes,
            count,
            durationMinutes:
              mode === "exam" && duration ? Number(duration) : null,
            requestId: requestId.current,
          }),
        }
      )
      onCreated(result.studySetId)
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      setPending(false)
    }
  }

  const form = (
    <form onSubmit={generate} className="flex min-h-0 w-full flex-col gap-7">
      <FieldGroup className={cn("gap-5", mode === "exam" && "gap-6")}>
        {allowConversationBasis && conversationId && (
          <FieldSet>
            <FieldLegend>Based on</FieldLegend>
            <ToggleGroup
              value={[sourceIds.length ? "sources" : "conversation"]}
              disabled={pending}
              onValueChange={(values) => {
                if (!values[0]) return
                setSourceIds(
                  values[0] === "conversation"
                    ? []
                    : sources.slice(0, 1).map((source) => source.id)
                )
                changed()
              }}
              className="w-full flex-wrap justify-start gap-1 rounded-2xl border p-2"
            >
              <ToggleGroupItem
                value="conversation"
                className="rounded-full px-3"
              >
                Recent conversation
              </ToggleGroupItem>
              <ToggleGroupItem
                value="sources"
                disabled={!sources.length}
                className="rounded-full px-3"
              >
                Selected materials
              </ToggleGroupItem>
            </ToggleGroup>
            {!sourceIds.length && (
              <FieldDescription>
                {conversationReady
                  ? "Uses the recent saved conversation. No material citations will be added."
                  : "Send a question and wait for a completed answer before generating from this conversation."}
              </FieldDescription>
            )}
          </FieldSet>
        )}
        {mode === "exam" && (!conversationId || sourceIds.length > 0) && (
          <AssessmentSourcePicker
            sources={sources}
            sourceTitle={sourceTitle}
            selectedIds={sourceIds}
            disabled={pending}
            onChange={(ids) => {
              setSourceIds(ids)
              changed()
            }}
          />
        )}
        <FieldSet className="gap-3">
          <FieldLegend className="mb-0">
            {mode === "exam" ? "Question Type" : "Question Types"}
            {mode === "exam" && <span className="text-destructive">*</span>}
          </FieldLegend>
          <ToggleGroup
            multiple
            value={questionTypes}
            onValueChange={(values) => {
              setQuestionTypes(
                QUESTION_TYPES.filter((type) => values.includes(type))
              )
              changed()
            }}
            disabled={pending}
            aria-label="Question types"
            className={cn(
              "w-full flex-wrap justify-start gap-1 rounded-[16px] border p-2",
              mode === "exam" &&
                "grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-x-2 gap-y-1 rounded-[24px]"
            )}
          >
            {questionTypeOptions.map(({ type, icon: Icon }) => (
              <ToggleGroupItem
                key={type}
                value={type}
                className={cn(
                  "rounded-full px-3 text-xs aria-pressed:bg-info aria-pressed:text-info-accent",
                  mode === "exam" &&
                    "h-10 gap-2 justify-self-start px-3 text-sm font-normal text-muted-foreground"
                )}
              >
                {mode === "exam" && <Icon data-icon="inline-start" />}
                {questionTypeLabels[type]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!questionTypes.length && (
            <FieldDescription>
              Select at least one question type.
            </FieldDescription>
          )}
        </FieldSet>
        <FieldGroup
          className={cn("gap-4", mode === "exam" && "grid grid-cols-2")}
        >
          <Field>
            <FieldLabel
              htmlFor={`assessment-${mode}-count`}
              className={cn(mode === "exam" && "min-h-6 font-medium")}
            >
              Number of Questions
              {mode === "exam" && (
                <span className="-ml-2 text-destructive">*</span>
              )}
            </FieldLabel>
            <Input
              id={`assessment-${mode}-count`}
              type="number"
              min={5}
              max={maximumCount}
              required
              aria-describedby={`assessment-${mode}-count-help`}
              value={count}
              disabled={pending}
              onChange={(event) => {
                setCount(Number(event.target.value))
                changed()
              }}
              className={cn(
                "h-12 rounded-xl",
                mode === "exam" && "h-14 rounded-[24px] px-6 text-base"
              )}
            />
            <FieldDescription
              id={`assessment-${mode}-count-help`}
              className={cn(mode === "exam" && "sr-only")}
            >
              5–{maximumCount} questions
            </FieldDescription>
          </Field>
          {mode === "exam" && (
            <Field>
              <FieldLabel
                htmlFor="assessment-duration"
                className="min-h-6 font-medium"
              >
                Exam Length (Minutes)
              </FieldLabel>
              <Input
                id="assessment-duration"
                type="number"
                min={1}
                max={180}
                aria-describedby="assessment-duration-help"
                value={duration}
                disabled={pending}
                placeholder="e.g., 60"
                onChange={(event) => {
                  setDuration(event.target.value)
                  changed()
                }}
                className="h-14 rounded-[24px] px-6 text-base"
              />
              <FieldDescription
                id="assessment-duration-help"
                className="sr-only"
              >
                Optional. Leave blank for no timer, or enter 1–180 minutes.
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div
        className={cn(
          "flex items-center gap-3",
          mode === "quiz" && "justify-end border-t pt-4"
        )}
      >
        <Button
          type="button"
          variant="outline"
          size={mode === "exam" ? "icon" : "default"}
          aria-label={mode === "exam" ? "Back" : undefined}
          disabled={pending}
          onClick={onCancel}
          className={cn(
            "h-10 rounded-xl px-4",
            mode === "exam" && "size-12 rounded-full p-0"
          )}
        >
          {mode === "exam" ? <NavArrowLeft /> : "Cancel"}
        </Button>
        <Button
          type="submit"
          disabled={pending || invalid}
          className={cn(
            "h-10 rounded-xl px-5",
            mode === "exam" && "h-12 flex-1 rounded-full"
          )}
        >
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Starting…" : mode === "exam" ? "Start" : "Generate"}
        </Button>
      </div>
      {mode === "quiz" && (
        <p className="text-xs leading-5 text-muted-foreground">
          Generating a new set uses your study-set allowance. Opening a saved
          set does not.
        </p>
      )}
    </form>
  )

  if (mode === "exam") return form

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange?.(next)
      }}
    >
      <DialogContent className="flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[576px]! flex-col gap-6 overflow-y-auto rounded-[12px] p-6">
        <DialogHeader>
          <DialogTitle>Generate Quiz</DialogTitle>
          <DialogDescription>
            Create quiz sets with your preferred question types.
          </DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}
