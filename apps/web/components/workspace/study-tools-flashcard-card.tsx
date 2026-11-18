"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { EditPencil, LightBulb, Star } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { ChatAnswer } from "./chat-answer"
import type { StudyCard, StudyCitation } from "./study-tools-types"

export function FlashcardFace({
  card,
  revealed,
  busy,
  compact = false,
  onReveal,
  onStar,
  onEdit,
  onCitation,
}: {
  card: StudyCard
  revealed: boolean
  busy: boolean
  compact?: boolean
  onReveal: () => void
  onStar: () => void
  onEdit: () => void
  onCitation: (citation: StudyCitation) => void
}) {
  const [hint, setHint] = useState(false)
  const [explanation, setExplanation] = useState(false)
  const reducedMotion = useReducedMotion()
  const duration = reducedMotion ? 0 : 0.16

  return (
    <Card
      className={cn(
        "gap-0 rounded-xl shadow-none",
        compact ? "min-h-64" : "min-h-80"
      )}
      role="region"
      aria-label="Flashcard"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="sr-only">
          {revealed ? "Answer" : "Question"}
        </CardTitle>
        <div>
          {card.prompt.hint && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              aria-expanded={hint}
              onClick={() => setHint(!hint)}
            >
              <LightBulb data-icon="inline-start" />
              Hint
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={card.review?.starred ? "Unstar card" : "Star card"}
            aria-pressed={!!card.review?.starred}
            onClick={onStar}
          >
            <Star
              aria-hidden="true"
              className={cn(card.review?.starred && "fill-current")}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label="Edit this card"
            onClick={onEdit}
          >
            <EditPencil aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "flex flex-1 flex-col justify-center gap-5 px-6 text-center",
          compact ? "min-h-44 py-5" : "min-h-64 py-8"
        )}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={revealed ? "answer" : "question"}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -3 }}
            transition={{ duration }}
          >
            <ChatAnswer
              text={revealed ? card.answer.back : card.prompt.front}
            />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {hint && !revealed && card.prompt.hint && (
            <motion.p
              key="hint"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration }}
              className="overflow-hidden text-sm leading-6 text-muted-foreground"
            >
              {card.prompt.hint}
            </motion.p>
          )}
        </AnimatePresence>
        {revealed && (
          <div className="flex flex-col items-center gap-3">
            {!!card.citations?.length && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {card.citations.map((citation, index) => (
                  <Button
                    key={`${citation.material_id}:${citation.page}:${index}`}
                    variant="secondary"
                    size="xs"
                    className="rounded-full"
                    onClick={() => onCitation(citation)}
                    aria-label={`Open source, page or segment ${citation.page}`}
                  >
                    p. {citation.page}
                  </Button>
                ))}
              </div>
            )}
            {card.answer.explanation && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-expanded={explanation}
                  onClick={() => setExplanation(!explanation)}
                >
                  {explanation ? "Hide explanation" : "Show explanation"}
                </Button>
                <motion.div
                  initial={false}
                  animate={{
                    height: explanation ? "auto" : 0,
                    opacity: explanation ? 1 : 0,
                  }}
                  transition={{ duration }}
                  inert={!explanation}
                  aria-hidden={!explanation}
                  className="overflow-hidden text-left text-sm text-muted-foreground"
                >
                  <ChatAnswer text={card.answer.explanation} />
                </motion.div>
              </>
            )}
          </div>
        )}
      </CardContent>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onReveal}
        aria-expanded={revealed}
        className="mx-auto rounded-full text-muted-foreground"
      >
        {revealed ? "Show question" : "Tap to show answer"}
      </Button>
    </Card>
  )
}
