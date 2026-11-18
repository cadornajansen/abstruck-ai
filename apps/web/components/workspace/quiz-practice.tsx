"use client"

import { useState } from "react"
import {
  Check,
  CheckCircle,
  NavArrowLeft,
  NavArrowRight,
  Xmark,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Progress } from "@workspace/ui/components/progress"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { cn } from "@workspace/ui/lib/utils"

type QuestionKind =
  | "Multiple choice"
  | "Multi select"
  | "True or false"
  | "Fill in the blank"
  | "Free response"
interface SampleQuestion {
  id: string
  kind: QuestionKind
  prompt: string
  options?: string[]
  answer: string[]
  explanation: string
}

const questions: SampleQuestion[] = [
  {
    id: "factor",
    kind: "Multiple choice",
    prompt: "Why did the class change only one factor at a time?",
    options: [
      "To make its effect easier to compare",
      "To make every plant grow at the same speed",
      "To remove the need to measure plants",
      "To guarantee the expected result",
    ],
    answer: ["To make its effect easier to compare"],
    explanation:
      "Keeping other conditions consistent makes it easier to compare the effect of the factor being changed.",
  },
  {
    id: "conditions",
    kind: "Multi select",
    prompt:
      "Which conditions can a greenhouse help control? Select all that apply.",
    options: ["Light", "Temperature", "The final conclusion", "Water"],
    answer: ["Light", "Temperature", "Water"],
    explanation:
      "The sample source identifies light, temperature and water as conditions that researchers can control.",
  },
  {
    id: "cause",
    kind: "True or false",
    prompt: "A change in plant growth explains every possible cause by itself.",
    options: ["True", "False"],
    answer: ["False"],
    explanation:
      "The results describe observations. Additional evidence may be needed to explain the causes.",
  },
  {
    id: "measure",
    kind: "Fill in the blank",
    prompt: "Plant _____ was measured at the same time each day.",
    answer: ["height"],
    explanation: "The class measured plant height using a consistent method.",
  },
  {
    id: "reason",
    kind: "Free response",
    prompt:
      "Explain why measurements should be taken using a consistent method.",
    answer: [],
    explanation:
      "A strong answer explains that consistent measurements make observations comparable and reduce differences caused by the method. This sample rubric is shown without grading your response.",
  },
]

interface PracticeAnswer {
  values: string[]
  submitted: boolean
  skipped: boolean
}

export function QuizPractice({
  onBack,
  onCitation,
}: {
  onBack: () => void
  onCitation: () => void
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, PracticeAnswer>>({})
  const [complete, setComplete] = useState(false)
  const question = questions[index]!
  const answer = answers[question.id] ?? {
    values: [],
    submitted: false,
    skipped: false,
  }
  const correct =
    !answer.skipped &&
    question.answer.length > 0 &&
    question.answer.length === answer.values.length &&
    question.answer.every((expected) =>
      answer.values.some(
        (value) => value.trim().toLowerCase() === expected.toLowerCase()
      )
    )

  function update(values: string[], submitted = false, skipped = false) {
    setAnswers((current) => ({
      ...current,
      [question.id]: { values, submitted, skipped },
    }))
  }

  if (complete)
    return (
      <section className="flex flex-col items-center gap-5 px-4 py-12 text-center">
        <CheckCircle className="size-12 text-plan-foreground" />
        <h2 className="text-2xl">Practice complete</h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          You explored all five sample question formats. This preview has no
          saved attempt or official score.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setComplete(false)
              setIndex(0)
            }}
          >
            Review answers
          </Button>
          <Button
            onClick={() => {
              setComplete(false)
              setIndex(0)
              setAnswers({})
            }}
          >
            Practise again
          </Button>
        </div>
        <Button variant="ghost" onClick={onBack}>
          Back to my sets
        </Button>
      </section>
    )

  return (
    <section className="px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          <NavArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <span className="text-xs text-muted-foreground">{question.kind}</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{index + 1}</span>
        <Progress
          value={((index + 1) / questions.length) * 100}
          aria-label="Question progress"
          className="flex-1 [&_[data-slot=progress-indicator]]:bg-plan-foreground"
        />
        <span className="text-xs text-muted-foreground">
          {questions.length}
        </span>
      </div>
      <h2 className="mt-7 text-base leading-7">{question.prompt}</h2>
      <div className="mt-5 flex flex-col gap-2">
        {question.options?.map((option, optionIndex) => {
          const selected = answer.values.includes(option)
          const expected = answer.submitted && question.answer.includes(option)
          const incorrect = answer.submitted && selected && !expected
          const className = cn(
            "h-auto min-h-14 w-full justify-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm leading-7 font-normal whitespace-normal",
            expected && "border-plan-foreground bg-plan/30 text-foreground",
            incorrect && "border-destructive bg-destructive/5",
            answer.submitted && "disabled:opacity-100"
          )
          if (question.kind === "Multi select")
            return (
              <Field
                orientation="horizontal"
                key={option}
                className={cn(className, "items-start")}
              >
                <Checkbox
                  id={`choice-${question.id}-${optionIndex}`}
                  checked={selected}
                  disabled={answer.submitted}
                  onCheckedChange={(checked) =>
                    update(
                      checked
                        ? [...answer.values, option]
                        : answer.values.filter((value) => value !== option)
                    )
                  }
                  className="mt-1"
                />
                <FieldLabel
                  htmlFor={`choice-${question.id}-${optionIndex}`}
                  className="flex-1 leading-7 font-normal"
                >
                  {option}
                </FieldLabel>
              </Field>
            )
          return (
            <Button
              key={option}
              variant="outline"
              className={className}
              disabled={answer.submitted}
              onClick={() => update([option], true)}
            >
              <span className="w-4 shrink-0 text-muted-foreground">
                {expected ? (
                  <Check className="size-4 text-plan-foreground" />
                ) : incorrect ? (
                  <Xmark className="size-4 text-destructive" />
                ) : (
                  `${String.fromCharCode(65 + optionIndex)}.`
                )}
              </span>
              {option}
            </Button>
          )
        })}
        {question.kind === "Fill in the blank" && (
          <Field>
            <FieldLabel htmlFor="blank-answer" className="sr-only">
              Your answer
            </FieldLabel>
            <Input
              id="blank-answer"
              placeholder="Type your answer"
              value={answer.values[0] ?? ""}
              disabled={answer.submitted}
              onChange={(event) => update([event.target.value])}
              className="h-12 rounded-xl"
            />
          </Field>
        )}
        {question.kind === "Free response" && (
          <Field>
            <FieldLabel htmlFor="written-answer" className="sr-only">
              Your response
            </FieldLabel>
            <Textarea
              id="written-answer"
              placeholder="Explain in your own words…"
              value={answer.values[0] ?? ""}
              disabled={answer.submitted}
              onChange={(event) => update([event.target.value])}
              className="min-h-36 rounded-2xl p-4"
            />
          </Field>
        )}
      </div>
      {answer.submitted ? (
        <Alert
          className={cn(
            "mt-6 rounded-2xl p-4",
            correct && "border-plan/40 bg-plan/30"
          )}
        >
          <AlertTitle className={cn(correct && "text-plan-foreground")}>
            {question.kind === "Free response"
              ? "Compare with the sample rubric"
              : correct
                ? "Correct"
                : answer.skipped
                  ? "Let’s review this one"
                  : "Not quite"}
          </AlertTitle>
          <AlertDescription className="mt-2 leading-7">
            {question.explanation}
            <Button
              variant="secondary"
              size="xs"
              className="mt-2 w-fit rounded-full"
              onClick={onCitation}
            >
              p. 2
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <Button variant="ghost" onClick={() => update([], true, true)}>
            Don’t know
          </Button>
          {["Multi select", "Fill in the blank", "Free response"].includes(
            question.kind
          ) && (
            <Button
              disabled={!answer.values.some((value) => value.trim())}
              onClick={() => update(answer.values, true)}
            >
              {question.kind === "Free response"
                ? "View sample rubric"
                : "Check answer"}
            </Button>
          )}
        </div>
      )}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => setIndex((value) => value - 1)}
        >
          <NavArrowLeft data-icon="inline-start" />
          Previous
        </Button>
        <Button
          disabled={!answer.submitted}
          onClick={() =>
            index === questions.length - 1
              ? setComplete(true)
              : setIndex((value) => value + 1)
          }
        >
          {index === questions.length - 1 ? "Finish practice" : "Next"}
          <NavArrowRight data-icon="inline-end" />
        </Button>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Synthetic practice · answers stay in this preview until you leave the
        screen.
      </p>
    </section>
  )
}
