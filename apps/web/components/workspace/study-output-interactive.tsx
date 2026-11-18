"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import type {
  InteractiveOutput,
  StudyOutputCitation,
} from "@/lib/study-output-types"
import { StudyOutputCitations } from "./study-output-citations"

export function StudyOutputInteractive({
  output,
  onCitation,
}: {
  output: InteractiveOutput
  onCitation: (citation: StudyOutputCitation) => void
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [hint, setHint] = useState(false)
  const reducedMotion = useReducedMotion()
  const step = output.steps[index]
  if (!step) return null
  const choice = answers[step.id]
  const revealed = !!checked[step.id]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          Step {index + 1} of {output.steps.length}
        </span>
        <Progress
          value={(Object.keys(checked).length / output.steps.length) * 100}
          className="flex-1"
          aria-label="Practice steps checked"
        />
      </div>
      <h3 className="text-base leading-7">{step.prompt}</h3>
      <ToggleGroup
        orientation="vertical"
        value={choice ? [choice] : []}
        onValueChange={(values) => {
          if (values[0]) {
            setAnswers((current) => ({ ...current, [step.id]: values[0]! }))
            setChecked((current) => {
              const next = { ...current }
              delete next[step.id]
              return next
            })
          }
        }}
        className="w-full gap-2"
        aria-label="Practice choices"
      >
        {step.choices.map((option) => (
          <ToggleGroupItem
            key={option.id}
            value={option.id}
            variant="outline"
            className="h-auto min-h-12 w-full justify-start rounded-[16px] px-4 py-3 text-left text-sm font-normal whitespace-normal"
          >
            {option.text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!choice || revealed}
          onClick={() =>
            setChecked((current) => ({ ...current, [step.id]: true }))
          }
          className="rounded-full"
        >
          Check choice
        </Button>
        {step.hint && (
          <Button
            variant="ghost"
            onClick={() => setHint((value) => !value)}
            className="rounded-full"
          >
            {hint ? "Hide hint" : "Show hint"}
          </Button>
        )}
      </div>
      <AnimatePresence key={`hint:${step.id}`} initial={false}>
        {hint && (
          <motion.p
            key={`hint:${step.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className="overflow-hidden rounded-[16px] bg-muted/40 p-4 text-sm leading-6"
          >
            {step.hint}
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence key={`feedback:${step.id}`} initial={false}>
        {revealed && (
          <motion.div
            key={`feedback:${step.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.16 }}
            className="overflow-hidden"
          >
            <Alert className="rounded-[16px]">
              <AlertTitle>
                {choice === step.correctChoiceId
                  ? "That matches the saved answer"
                  : "Review this explanation"}
              </AlertTitle>
              <AlertDescription className="mt-2 flex flex-col gap-3">
                <p>{step.explanation}</p>
                <StudyOutputCitations
                  citations={step.citations}
                  onCitation={onCitation}
                />
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex justify-between gap-3 border-t pt-4">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => {
            setIndex((value) => value - 1)
            setHint(false)
          }}
          className="rounded-full"
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={index === output.steps.length - 1}
          onClick={() => {
            setIndex((value) => value + 1)
            setHint(false)
          }}
          className="rounded-full"
        >
          Next
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Guided practice uses the saved explanations. Checking a choice does not
        use an AI allowance or create a graded assessment attempt. These
        practice selections stay in this open view.
      </p>
    </div>
  )
}
