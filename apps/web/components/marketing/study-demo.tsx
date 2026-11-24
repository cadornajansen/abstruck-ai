"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  ArrowRight,
  ArrowLeft,
  Book,
  Check,
  Notes,
  Page,
  Refresh,
  Folder,
  ChatBubble,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { Message, MessageContent } from "@workspace/ui/components/message"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { cn } from "@workspace/ui/lib/utils"

const initialNotes =
  "Encoding → storage → retrieval.\n\nMy example: connect a new concept to something I already know."
const questions = [
  [
    "How does a memory begin?",
    "A memory begins with encoding: taking in information and giving it meaning. Attention helps start that process.",
    "Encoding gives incoming information meaning. Attention helps determine what enters memory.",
  ],
  [
    "What does retrieval mean?",
    "Retrieval means bringing stored information back to mind. Explaining an idea with your notes closed is one example.",
    "Retrieval brings stored information back into awareness. Recalling a concept without looking at notes uses retrieval.",
  ],
  [
    "How are the stages connected?",
    "Encoding takes information in, storage keeps it available, and retrieval brings it back when you need it.",
    "Memory involves encoding, storage and retrieval. These processes work together when we learn and recall information.",
  ],
] as const
const cards = [
  ["What is retrieval?", "Bringing stored information back to mind."],
  ["What happens during encoding?", "Incoming information is given meaning."],
  ["What does storage do?", "Keeps information available over time."],
] as const

export function StudyDemo() {
  const [tab, setTab] = useState("understand")
  const [question, setQuestion] = useState(0)
  const [source, setSource] = useState(false)
  const [notes, setNotes] = useState(initialNotes)
  const [card, setCard] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState<number | null>(null)
  const reduced = useReducedMotion()
  function reset() {
    setTab("understand")
    setQuestion(0)
    setSource(false)
    setNotes(initialNotes)
    setCard(0)
    setRevealed(false)
    setAnswer(null)
  }
  return (
    <section
      id="product-demo"
      aria-label="Interactive fictional study workspace"
      className="mx-auto w-full max-w-6xl scroll-mt-28 px-5 sm:px-8"
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="ghost" onClick={reset}>
          <Refresh data-icon="inline-start" />
          Reset demo
        </Button>
      </div>
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-background shadow-composer">
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
          <div className="flex justify-center border-b border-border/60 px-2 py-4">
            <TabsList className="h-11 max-w-full gap-1 bg-transparent">
              <TabsTrigger value="understand" className="px-2 sm:px-5">
                <Book data-icon="inline-start" />
                Understand it
              </TabsTrigger>
              <TabsTrigger value="notes" className="px-2 sm:px-5">
                <Notes data-icon="inline-start" />
                Make notes
              </TabsTrigger>
              <TabsTrigger value="practise" className="px-2 sm:px-5">
                <Check data-icon="inline-start" />
                Test myself
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="grid md:grid-cols-[190px_1fr]">
            <aside
              className="hidden flex-col gap-6 border-r border-border/60 bg-muted/30 p-5 md:flex"
              aria-label="Sample space"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <Folder className="size-4 text-info-foreground" />
                Memory & learning
              </p>
              <p className="text-xs text-muted-foreground">SAMPLE MATERIALS</p>
              <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-3 text-xs">
                <Page className="size-4 shrink-0" />
                How memories are made
              </div>
              <p className="mt-auto text-xs leading-5 text-muted-foreground">
                A fictional psychology lesson.
                <br />
                Try the study activities.
              </p>
            </aside>
            <div className="min-w-0 p-5 sm:p-8">
              <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium tracking-tight sm:text-xl">
                    How memories are made
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cognitive psychology · Sample lesson
                  </p>
                </div>
                <Badge variant="outline">Local demo</Badge>
              </div>
              <TabsContent value="understand">
                <div className="grid gap-7 lg:grid-cols-[1fr_1.15fr]">
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground">
                      A QUESTION WORTH ASKING
                    </p>
                    {questions.map(([label], index) => (
                      <Button
                        key={label}
                        variant={question === index ? "secondary" : "ghost"}
                        className="h-auto min-h-11 justify-between rounded-xl px-4 py-3 text-left whitespace-normal"
                        onClick={() => {
                          setQuestion(index)
                          setSource(false)
                        }}
                      >
                        {label}
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    ))}
                    <p className="text-xs leading-5 text-muted-foreground">
                      Choose a prepared question to explore a sample answer.
                    </p>
                  </div>
                  <div className="flex min-h-64 flex-col gap-4 rounded-2xl bg-muted/35 p-5 sm:p-6">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ChatBubble className="size-4" />
                      Prepared sample answer
                    </p>
                    <Message>
                      <MessageContent>
                        <Bubble variant="ghost">
                          <BubbleContent>
                            <p className="text-base leading-7">
                              {questions[question]![1]}
                            </p>
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto w-fit"
                      aria-expanded={source}
                      onClick={() => setSource(!source)}
                    >
                      <Page data-icon="inline-start" />
                      Sample source · Page 1
                    </Button>
                    <AnimatePresence initial={false}>
                      {source && (
                        <motion.blockquote
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: reduced ? 0 : 0.18 }}
                          className="overflow-hidden border-l-2 border-info-border pl-4 text-sm leading-6 text-muted-foreground"
                        >
                          {questions[question]![2]}
                        </motion.blockquote>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="notes">
                <Field>
                  <FieldLabel htmlFor="demo-notes">
                    In your own words
                  </FieldLabel>
                  <Textarea
                    id="demo-notes"
                    value={notes}
                    maxLength={4000}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-64 rounded-xl p-5 leading-7"
                  />
                  <FieldDescription>
                    Notes stay in this demo until you reset or refresh. Nothing
                    is uploaded.
                  </FieldDescription>
                </Field>
              </TabsContent>
              <TabsContent value="practise">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground">
                      FLASHCARD · {card + 1} / {cards.length}
                    </p>
                    <Button
                      variant="outline"
                      className="flex h-48 w-full flex-col gap-4 rounded-2xl p-6 text-center whitespace-normal"
                      aria-label={`${revealed ? "Answer" : "Question"}: ${cards[card]![revealed ? 1 : 0]}. Click to ${revealed ? "hide" : "reveal"}`}
                      aria-pressed={revealed}
                      onClick={() => setRevealed(!revealed)}
                    >
                      <span className="text-lg leading-7">
                        {cards[card]![revealed ? 1 : 0]}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {revealed
                          ? "Click to see the question"
                          : "Click to reveal"}
                      </span>
                    </Button>
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Previous flashcard"
                        onClick={() => {
                          setCard((card + cards.length - 1) % cards.length)
                          setRevealed(false)
                        }}
                      >
                        <ArrowLeft />
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        One idea at a time.
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Next flashcard"
                        onClick={() => {
                          setCard((card + 1) % cards.length)
                          setRevealed(false)
                        }}
                      >
                        <ArrowRight />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-muted-foreground">QUICK CHECK</p>
                    <h3 className="text-base font-medium">
                      Explaining an idea with your notes closed uses…
                    </h3>
                    {["Retrieval", "Storage only", "Copying"].map(
                      (option, index) => (
                        <Button
                          key={option}
                          variant={answer === index ? "secondary" : "outline"}
                          className="h-11 justify-start rounded-xl px-4"
                          aria-pressed={answer === index}
                          onClick={() => setAnswer(index)}
                        >
                          {option}
                        </Button>
                      )
                    )}
                    <p
                      role="status"
                      className={cn(
                        "min-h-12 text-sm leading-6",
                        answer === 0
                          ? "text-plan-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {answer === null
                        ? "Choose an answer for feedback."
                        : answer === 0
                          ? "That’s right. Retrieval brings stored information back to mind."
                          : "Try again. Which process brings information back to mind?"}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </section>
  )
}
