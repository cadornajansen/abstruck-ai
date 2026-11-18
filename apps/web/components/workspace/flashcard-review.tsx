"use client"

import { useState } from "react"
import {
  CheckCircle,
  EditPencil,
  LightBulb,
  NavArrowLeft,
  NavArrowRight,
  Plus,
  Star,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { Progress } from "@workspace/ui/components/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"

interface SampleCard {
  id: string
  term: string
  definition: string
  starred: boolean
}
const sampleCards: SampleCard[] = [
  {
    id: "factor",
    term: "Why change one factor at a time?",
    definition:
      "To compare its effect while keeping other conditions consistent.",
    starred: false,
  },
  {
    id: "measurement",
    term: "What did the class measure?",
    definition: "Plant height, at the same time each day.",
    starred: false,
  },
  {
    id: "evidence",
    term: "What should support a conclusion?",
    definition: "Recorded observations and evidence from the experiment.",
    starred: false,
  },
]

export function FlashcardReview({
  onBack,
  onCitation,
}: {
  onBack: () => void
  onCitation: () => void
}) {
  const [cards, setCards] = useState(sampleCards)
  const [mode, setMode] = useState("spaced")
  const [studying, setStudying] = useState(false)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [complete, setComplete] = useState(false)
  const [editing, setEditing] = useState<SampleCard | null>(null)
  const [notice, setNotice] = useState("")
  const card = cards[index]

  function move(next: number) {
    setIndex(next)
    setRevealed(false)
    setHint(false)
  }
  function rate(again: boolean) {
    setNotice(
      again
        ? "Again selected · 10-minute learning step in the planned scheduler. This preview does not save a due date."
        : "Reviewed locally · next planned step is 1 day. This preview does not save a due date."
    )
    if (index === cards.length - 1) setComplete(true)
    else move(index + 1)
  }
  function saveCard() {
    if (!editing?.term.trim() || !editing.definition.trim()) return
    setCards((current) =>
      current.some((item) => item.id === editing.id)
        ? current.map((item) => (item.id === editing.id ? editing : item))
        : [...current, editing]
    )
    setNotice(
      "Card updated in this preview. A saved card edit will reset that card’s review schedule once persistence is connected."
    )
    setEditing(null)
  }
  const management = (
    <section className="mt-7">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base">
          Flashcards{" "}
          <span className="text-muted-foreground">({cards.length})</span>
        </h3>
        <Button
          variant="ghost"
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              term: "",
              definition: "",
              starred: false,
            })
          }
        >
          <Plus data-icon="inline-start" />
          Add Card
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {cards.map((item, itemIndex) => (
          <article key={item.id} className="rounded-2xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Card {itemIndex + 1}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Edit card ${itemIndex + 1}`}
                onClick={() => setEditing({ ...item })}
              >
                <EditPencil />
              </Button>
            </div>
            <p className="leading-6">{item.term}</p>
            <p className="mt-3 border-t pt-3 text-sm leading-6 text-muted-foreground">
              {item.definition}
            </p>
          </article>
        ))}
      </div>
    </section>
  )

  return (
    <section className="px-3 py-3">
      <Button variant="ghost" onClick={onBack}>
        <NavArrowLeft data-icon="inline-start" />
        Back
      </Button>
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground"
        >
          {notice}
        </p>
      )}
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(String(value))
          setStudying(false)
          setComplete(false)
          move(0)
        }}
        className="mt-3"
      >
        {!studying && (
          <TabsList className="mx-auto">
            <TabsTrigger value="spaced">Spaced Repetition</TabsTrigger>
            <TabsTrigger value="fast">Fast Review</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="spaced">
          {!studying ? (
            <>
              <h2 className="mt-6 text-lg">Cards for today</h2>
              <div className="mt-4 rounded-2xl bg-muted/50 p-6">
                <div className="flex items-center justify-center gap-8">
                  <span className="grid size-20 place-items-center rounded-full border-8 border-muted text-3xl">
                    0
                  </span>
                  <div className="text-center">
                    <strong className="text-xl">{cards.length}</strong>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Not Studied
                    </p>
                  </div>
                  <div className="text-center">
                    <strong className="text-xl">0</strong>
                    <p className="mt-2 text-xs text-muted-foreground">
                      To review
                    </p>
                  </div>
                </div>
                <Button
                  className="mx-auto mt-5 flex w-full max-w-xs rounded-xl"
                  disabled={!cards.length}
                  onClick={() => {
                    setStudying(true)
                    setComplete(false)
                    move(0)
                  }}
                >
                  Study Cards
                </Button>
              </div>
              <h2 className="mt-7 text-lg">Deck progress</h2>
              <div className="mt-4 rounded-2xl bg-muted/50 p-4">
                <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
                  <span>{cards.length} Not Studied</span>
                  <span>0 To review</span>
                </div>
                <Progress value={0} aria-label="Sample deck progress" />
              </div>
              {management}
            </>
          ) : complete ? (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <CheckCircle className="size-10 text-plan-foreground" />
              <h2 className="text-2xl">You’ve reviewed this sample deck</h2>
              <p className="text-sm text-muted-foreground">
                Your real review history will be saved when account integration
                is ready.
              </p>
              <Button
                onClick={() => {
                  setStudying(false)
                  setComplete(false)
                  move(0)
                }}
              >
                Back to deck
              </Button>
            </div>
          ) : (
            <>
              <div className="my-5 flex items-center gap-3">
                <Button variant="ghost" onClick={() => setStudying(false)}>
                  Menu
                </Button>
                <Progress
                  value={(index / cards.length) * 100}
                  aria-label="Review progress"
                  className="flex-1"
                />
                <span className="text-xs">
                  {index} / {cards.length}
                </span>
              </div>
              {card && (
                <ReviewCard
                  card={card}
                  revealed={revealed}
                  hint={hint}
                  onReveal={() => setRevealed((value) => !value)}
                  onHint={() => setHint((value) => !value)}
                  onStar={() =>
                    setCards((current) =>
                      current.map((item) =>
                        item.id === card.id
                          ? { ...item, starred: !item.starred }
                          : item
                      )
                    )
                  }
                  onCitation={onCitation}
                />
              )}
              {revealed ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto flex-col py-3"
                    onClick={() => rate(true)}
                  >
                    Again
                    <span className="text-xs font-normal text-muted-foreground">
                      10 minutes
                    </span>
                  </Button>
                  <Button
                    className="h-auto flex-col py-3"
                    onClick={() => rate(false)}
                  >
                    Got it<span className="text-xs font-normal">1 day</span>
                  </Button>
                </div>
              ) : (
                <Button
                  className="mx-auto mt-5 flex rounded-xl"
                  onClick={() => setRevealed(true)}
                >
                  Tap to show answer
                </Button>
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="fast" className="pt-5">
          {card ? (
            <>
              <ReviewCard
                card={card}
                revealed={revealed}
                hint={hint}
                onReveal={() => setRevealed((value) => !value)}
                onHint={() => setHint((value) => !value)}
                onStar={() =>
                  setCards((current) =>
                    current.map((item) =>
                      item.id === card.id
                        ? { ...item, starred: !item.starred }
                        : item
                    )
                  )
                }
                onCitation={onCitation}
              />
              <div className="mt-5 flex items-center justify-center gap-5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous card"
                  disabled={index === 0}
                  onClick={() => move(index - 1)}
                >
                  <NavArrowLeft />
                </Button>
                <span className="text-sm">
                  {index + 1} / {cards.length}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next card"
                  disabled={index === cards.length - 1}
                  onClick={() => move(index + 1)}
                >
                  <NavArrowRight />
                </Button>
              </div>
              <Button
                variant="ghost"
                className="mx-auto mt-4 flex"
                onClick={() => setMode("spaced")}
              >
                Manage cards
              </Button>
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No cards yet</EmptyTitle>
                <EmptyDescription>
                  Add a card to start reviewing.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>
      </Tabs>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">
        Synthetic deck · changes and ratings stay in this preview only.
      </p>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cards.some((item) => item.id === editing?.id)
                ? "Edit card"
                : "Add card"}
            </DialogTitle>
            <DialogDescription>
              Keep each card focused on one idea.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="card-term">Term</FieldLabel>
              <Input
                id="card-term"
                value={editing?.term ?? ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, term: event.target.value } : null
                  )
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="card-definition">Definition</FieldLabel>
              <Textarea
                id="card-definition"
                value={editing?.definition ?? ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current
                      ? { ...current, definition: event.target.value }
                      : null
                  )
                }
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editing?.term.trim() || !editing?.definition.trim()}
              onClick={saveCard}
            >
              Save local card
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ReviewCard({
  card,
  revealed,
  hint,
  onReveal,
  onHint,
  onStar,
  onCitation,
}: {
  card: SampleCard
  revealed: boolean
  hint: boolean
  onReveal: () => void
  onHint: () => void
  onStar: () => void
  onCitation: () => void
}) {
  return (
    <div className="flex min-h-80 flex-col rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onHint} aria-pressed={hint}>
          <LightBulb data-icon="inline-start" />
          Hint
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={card.starred ? "Unstar card" : "Star card"}
          aria-pressed={card.starred}
          onClick={onStar}
        >
          <Star className={card.starred ? "fill-current" : ""} />
        </Button>
      </div>
      <Button
        variant="ghost"
        className="min-h-56 flex-1 rounded-xl px-6 text-center text-base leading-7 font-normal whitespace-normal"
        onClick={onReveal}
        aria-label={revealed ? "Show question" : "Show answer"}
      >
        {revealed ? card.definition : card.term}
      </Button>
      {hint && !revealed && (
        <p className="mb-3 text-center text-sm text-muted-foreground">
          Think about the experiment’s method and evidence.
        </p>
      )}
      {revealed && (
        <Button
          variant="secondary"
          size="xs"
          className="mx-auto rounded-full"
          onClick={onCitation}
        >
          p. 2
        </Button>
      )}
    </div>
  )
}
