"use client"

import { useEffect, useRef, useState } from "react"
import type { GroupImperativeHandle } from "react-resizable-panels"
import {
  ArrowUp,
  Book,
  Download,
  EditPencil,
  Expand,
  NavArrowLeft,
  NavArrowRight,
  Notes,
  Page,
  Plus,
  QuestionMark,
  Settings,
  Xmark,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@workspace/ui/components/field"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@workspace/ui/components/resizable"
import {
  Message,
  MessageContent,
  MessageGroup,
} from "@workspace/ui/components/message"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
} from "@workspace/ui/components/message-scroller"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import { QuizPractice } from "@/components/workspace/quiz-practice"
import { FlashcardReview } from "@/components/workspace/flashcard-review"

type Tool = "summary" | "notes" | "flashcards" | "quiz"
export type WorkspacePreviewState =
  | "ready"
  | "loading"
  | "offline"
  | "quota"
  | "answer-error"
  | "source-unavailable"
const tools = [
  { id: "summary", label: "Summary", icon: Page },
  { id: "quiz", label: "Quiz", icon: QuestionMark },
  { id: "flashcards", label: "Flashcards", icon: Book },
  { id: "notes", label: "Notes", icon: Notes },
] as const

export function StudyWorkspace({
  initialTool = "learn",
  state = "ready",
  onRetry,
}: {
  initialTool?: Tool | "learn" | "chat"
  state?: WorkspacePreviewState
  onRetry?: () => void
}) {
  const loading = state === "loading"
  const [tab, setTab] = useState<string>(initialTool)
  const [showSource, setShowSource] = useState(false)
  const [focusLearn, setFocusLearn] = useState(false)
  const [page, setPage] = useState(1)
  const [annotations, setAnnotations] = useState(false)
  const [settings, setSettings] = useState<Tool | null>(null)
  const [contextOpen, setContextOpen] = useState(false)
  const [sourceSelected, setSourceSelected] = useState(true)
  const [draft, setDraft] = useState("")
  const [chatError, setChatError] = useState(false)
  const [note, setNote] = useState(
    "# Greenhouse study notes\n\nLight, water and temperature affect plant growth.\n\nQuestions to review:\n- What did the experiment measure?\n- Which factors were held constant?"
  )
  const [noteEdited, setNoteEdited] = useState(false)
  const panelGroup = useRef<GroupImperativeHandle | null>(null)

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1023px)")
    const updateLayout = () => {
      // Collapse the library-owned outer panel; hiding its nested content leaves empty space.
      panelGroup.current?.setLayout(
        compact.matches
          ? { source: showSource ? 100 : 0, study: showSource ? 0 : 100 }
          : { source: focusLearn ? 0 : 60, study: focusLearn ? 100 : 40 }
      )
    }
    updateLayout()
    compact.addEventListener("change", updateLayout)
    return () => compact.removeEventListener("change", updateLayout)
  }, [showSource, focusLearn])

  const openTool = (tool: Tool) => {
    setSettings(null)
    setTab(tool)
  }
  const openCitation = () => {
    setPage(2)
    setShowSource(true)
    setFocusLearn(false)
  }
  const exportNote = () => {
    const url = URL.createObjectURL(
      new Blob([note], { type: "text/markdown;charset=utf-8" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "abstruck-notes.md"
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <main
      id="main-content"
      className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3"
    >
      <div className="flex items-center gap-2 lg:hidden">
        <Button
          variant="outline"
          onClick={() => setShowSource((current) => !current)}
          className="rounded-full"
        >
          <Page data-icon="inline-start" />
          {showSource ? "Hide source" : "Show source"}
        </Button>
        <span className="truncate text-xs text-muted-foreground">
          Greenhouse study notes
        </span>
      </div>
      <ResizablePanelGroup
        groupRef={panelGroup}
        orientation="horizontal"
        className={cn("gap-0", !focusLearn && "lg:gap-3")}
      >
        <ResizablePanel
          id="source"
          collapsible
          collapsedSize="0%"
          defaultSize="60%"
          minSize="30%"
          className={cn(
            "min-w-0",
            !showSource && "max-lg:hidden",
            focusLearn && "lg:hidden"
          )}
        >
          <section
            aria-label="Source viewer"
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border"
          >
            <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
              <Button
                variant="ghost"
                onClick={() => setAnnotations((current) => !current)}
                aria-pressed={annotations}
              >
                <EditPencil data-icon="inline-start" />
                <span className="hidden sm:inline">Annotations</span>
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Input
                  aria-label="Source page"
                  type="number"
                  min={1}
                  max={2}
                  value={page}
                  onChange={(event) =>
                    setPage(
                      Math.min(2, Math.max(1, Number(event.target.value) || 1))
                    )
                  }
                  className="w-14 rounded-xl text-center"
                />
                <span className="text-sm text-muted-foreground">/ 2</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                >
                  <NavArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page === 2}
                  onClick={() => setPage(2)}
                >
                  <NavArrowRight />
                </Button>
              </div>
            </div>
            {annotations && (
              <aside className="border-b bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">Annotations</h2>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hide annotations"
                    onClick={() => setAnnotations(false)}
                  >
                    <Xmark />
                  </Button>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  No annotations yet. Text selection and saved highlights will
                  be connected to the document viewer.
                </p>
              </aside>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-3 sm:p-6">
              {state === "source-unavailable" ? (
                <Empty className="min-h-80">
                  <EmptyHeader>
                    <Page className="size-8 text-muted-foreground" />
                    <EmptyTitle>This source is unavailable</EmptyTitle>
                    <EmptyDescription>
                      The file may have been removed or access may have changed.
                      Other saved work remains available.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" onClick={onRetry}>
                      Try again
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : loading ? (
                <div
                  role="status"
                  aria-label="Loading source"
                  className="flex flex-col gap-5 bg-background p-8"
                >
                  <Skeleton className="h-10 w-4/5" />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <article className="mx-auto min-h-[620px] max-w-2xl bg-background p-8 shadow-sm sm:p-12">
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                    Biology · Sample source
                  </p>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                    {page === 1
                      ? "Growing in a greenhouse"
                      : "Reading the results"}
                  </h1>
                  <p className="mt-5 text-sm leading-7 text-muted-foreground">
                    A synthetic learning material used to review Abstruck’s
                    interface.
                  </p>
                  <h2 className="mt-12 text-xl font-medium">
                    {page === 1 ? "The experiment" : "Key observations"}
                  </h2>
                  <p className="mt-4 text-base leading-8">
                    {page === 1
                      ? "A greenhouse lets researchers control light, temperature and water. The class compared plants grown under the same conditions while changing one factor at a time."
                      : "Plant height was measured at the same time each day. Keeping the method consistent makes the results easier to compare. A change in growth does not, by itself, explain every cause."}
                  </p>
                  <h2 className="mt-10 text-xl font-medium">
                    Questions to consider
                  </h2>
                  <ol className="mt-4 flex list-inside list-decimal flex-col gap-4 text-sm leading-7">
                    <li>What factor changed during the experiment?</li>
                    <li>Which conditions stayed the same?</li>
                    <li>What evidence supports your conclusion?</li>
                  </ol>
                  <p className="mt-16 border-t pt-3 text-xs text-muted-foreground">
                    Interface fixture · Page {page}
                  </p>
                </article>
              )}
            </div>
          </section>
        </ResizablePanel>
        {!focusLearn && <ResizableHandle className="hidden lg:flex" />}
        <ResizablePanel
          id="study"
          collapsible
          collapsedSize="0%"
          defaultSize="40%"
          minSize="30%"
          className={cn("min-w-0", showSource && "max-lg:hidden")}
        >
          <section
            aria-label="Study panel"
            className="flex h-full min-h-0 flex-col"
          >
            {state !== "ready" && state !== "loading" && (
              <Alert className="mb-3 rounded-2xl">
                <AlertTitle>
                  {state === "offline"
                    ? "Connection interrupted"
                    : state === "quota"
                      ? "You’ve reached your chat allowance"
                      : state === "source-unavailable"
                        ? "Choose another source to continue"
                        : "This answer couldn’t finish"}
                </AlertTitle>
                <AlertDescription>
                  {state === "offline"
                    ? "Your question stays in the composer. Reconnect before sending it again."
                    : state === "quota"
                      ? "Your saved materials, notes and existing practice sets are still available."
                      : state === "source-unavailable"
                        ? "We can’t use an unavailable source to answer questions or create new study sets."
                        : "Your question is still here. You can retry without typing it again."}
                  {state === "quota" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-fit"
                      render={<a href="/preview/billing" />}
                      nativeButton={false}
                    >
                      View plans and usage
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-fit"
                      onClick={onRetry}
                    >
                      Try again
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(String(value))}
              className="min-h-0 flex-1 gap-3"
            >
              <div className="flex min-w-0 items-center gap-1">
                <TabsList className="h-9 min-w-0 flex-1 justify-start gap-1 overflow-x-auto overflow-y-hidden bg-transparent p-0">
                  <TabsTrigger
                    value="chat"
                    className="h-8 flex-none rounded-full px-4 font-normal data-active:bg-muted data-active:shadow-none"
                  >
                    Chat
                  </TabsTrigger>
                  <TabsTrigger
                    value="learn"
                    className="h-8 flex-none rounded-full px-4 font-normal data-active:bg-muted data-active:shadow-none"
                  >
                    <Plus />
                    Learn Tab
                  </TabsTrigger>
                  {!["learn", "chat"].includes(tab) && (
                    <TabsTrigger
                      value={tab}
                      className="h-8 flex-none rounded-full px-4 font-normal capitalize data-active:bg-muted data-active:shadow-none"
                    >
                      {tab}
                    </TabsTrigger>
                  )}
                </TabsList>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    focusLearn ? "Show source panel" : "Focus study panel"
                  }
                  onClick={() => setFocusLearn((current) => !current)}
                  className="hidden lg:inline-flex"
                >
                  <Expand />
                </Button>
              </div>
              <TabsContent
                value="learn"
                className="min-h-0 overflow-y-auto px-2 py-5"
              >
                {loading ? (
                  <div
                    role="status"
                    aria-label="Loading study sets"
                    className="grid grid-cols-2 gap-3"
                  >
                    <Skeleton className="col-span-full mb-2 h-5 w-24" />
                    {[1, 2, 3, 4].map((item) => (
                      <Skeleton key={item} className="h-14 rounded-2xl" />
                    ))}
                    <Skeleton className="col-span-full mt-6 h-20 rounded-2xl" />
                  </div>
                ) : (
                  <>
                    <h2 className="mb-4 text-lg">Generate</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {tools.map(({ id, label, icon: Icon }) => (
                        <div
                          key={id}
                          className="flex items-center rounded-2xl border p-1"
                        >
                          <Button
                            variant="ghost"
                            className="h-11 flex-1 justify-start gap-3 rounded-xl px-3"
                            onClick={() =>
                              id === "notes" ? openTool(id) : setSettings(id)
                            }
                          >
                            <Icon data-icon="inline-start" />
                            {label}
                          </Button>
                          {id !== "notes" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${label} settings`}
                              onClick={() => setSettings(id)}
                            >
                              <Settings />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <h2 className="mt-9 mb-4 text-lg">My Sets</h2>
                    <div className="flex flex-col gap-2">
                      {tools.map(({ id, label, icon: Icon }) => (
                        <Button
                          key={id}
                          variant="ghost"
                          onClick={() => openTool(id)}
                          className="h-auto justify-start gap-3 rounded-xl border p-4"
                        >
                          <Icon data-icon="inline-start" />
                          <span className="min-w-0 text-left">
                            <span className="block">
                              Greenhouse {label.toLowerCase()}
                            </span>
                            <span className="mt-1 block text-xs font-normal text-muted-foreground">
                              Synthetic saved-set preview
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>
              <TabsContent value="chat" className="min-h-0">
                <MessageScrollerProvider>
                  <MessageScroller>
                    <MessageScrollerViewport>
                      <MessageScrollerContent className="px-3 py-6">
                        <MessageScrollerItem>
                          <MessageGroup>
                            <Message align="end">
                              <MessageContent>
                                <Bubble variant="muted">
                                  <BubbleContent>
                                    What should I understand from this
                                    experiment?
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                            <Message>
                              <MessageContent>
                                <Bubble variant="ghost">
                                  <BubbleContent>
                                    <p className="text-base leading-8">
                                      The central idea is to{" "}
                                      <strong>
                                        change one factor at a time
                                      </strong>
                                      , while keeping other conditions
                                      consistent. That helps you compare plant
                                      growth and connect your conclusion to the
                                      evidence.
                                    </p>
                                    <Button
                                      variant="secondary"
                                      size="xs"
                                      className="mt-3 rounded-full"
                                      onClick={openCitation}
                                    >
                                      p. 2
                                    </Button>
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          </MessageGroup>
                        </MessageScrollerItem>
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                  </MessageScroller>
                </MessageScrollerProvider>
              </TabsContent>
              <TabsContent
                value="summary"
                className="min-h-0 overflow-y-auto px-3 py-4"
              >
                <Button variant="ghost" onClick={() => setTab("learn")}>
                  <NavArrowLeft data-icon="inline-start" />
                  Back
                </Button>
                <h2 className="mt-5 text-2xl">Understanding the experiment</h2>
                <p className="mt-5 text-base leading-8">
                  A greenhouse creates a controlled environment for studying
                  plant growth. Compare observations using the same method, and
                  separate what the evidence shows from what still needs
                  investigation.
                </p>
                <h3 className="mt-7 font-medium">Key ideas</h3>
                <ul className="mt-3 flex list-inside list-disc flex-col gap-3 leading-7">
                  <li>Change one factor at a time.</li>
                  <li>Keep measurements consistent.</li>
                  <li>Support conclusions with recorded observations.</li>
                </ul>
                <Button
                  variant="secondary"
                  size="xs"
                  className="mt-5 rounded-full"
                  onClick={openCitation}
                >
                  p. 2
                </Button>
                <div className="mt-8 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNote(
                        "# Understanding the experiment\n\nChange one factor at a time. Keep measurements consistent. Support conclusions with evidence."
                      )
                      setNoteEdited(true)
                      setTab("notes")
                    }}
                  >
                    <Notes data-icon="inline-start" />
                    Copy to notes
                  </Button>
                </div>
              </TabsContent>
              <TabsContent
                value="notes"
                className="min-h-0 overflow-y-auto px-3 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl">My notes</h2>
                  <p role="status" className="text-xs text-muted-foreground">
                    {noteEdited ? "Local draft · not saved" : "Sample note"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  disabled={!note.trim()}
                  onClick={exportNote}
                >
                  <Download data-icon="inline-start" />
                  Export Markdown
                </Button>
                <Textarea
                  aria-label="Study notes"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value)
                    setNoteEdited(true)
                  }}
                  className="mt-5 min-h-80 resize-y rounded-2xl p-5 leading-7"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  This draft stays on this screen. Account autosave and conflict
                  recovery are not connected yet.
                </p>
              </TabsContent>
              <TabsContent
                value="flashcards"
                className="min-h-0 overflow-y-auto"
              >
                <FlashcardReview
                  onBack={() => setTab("learn")}
                  onCitation={openCitation}
                />
              </TabsContent>
              <TabsContent value="quiz" className="min-h-0 overflow-y-auto">
                <QuizPractice
                  onBack={() => setTab("learn")}
                  onCitation={openCitation}
                />
              </TabsContent>
            </Tabs>
            {chatError && (
              <Alert className="mb-2">
                <AlertTitle>Chat is not connected yet</AlertTitle>
                <AlertDescription>
                  Your question is still in the composer. The answer above is a
                  fixed preview, not an AI response.
                </AlertDescription>
              </Alert>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setChatError(true)
              }}
              className="mt-2"
            >
              <InputGroup className="rounded-3xl p-2 shadow-composer">
                <InputGroupTextarea
                  aria-label="Ask anything"
                  placeholder="Ask anything"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  className="min-h-16"
                />
                <InputGroupAddon align="block-end">
                  <InputGroupButton
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setContextOpen(true)}
                  >
                    <Plus data-icon="inline-start" />
                    Add Context
                  </InputGroupButton>
                  <span className="text-xs">
                    {sourceSelected ? "1 source" : "No sources"}
                  </span>
                  <InputGroupButton
                    type="submit"
                    size="icon-sm"
                    className="ml-auto rounded-full"
                    aria-label="Send question"
                    disabled={
                      !draft.trim() ||
                      !sourceSelected ||
                      [
                        "loading",
                        "offline",
                        "quota",
                        "source-unavailable",
                      ].includes(state)
                    }
                  >
                    <ArrowUp />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
      <GenerationDialog
        tool={settings}
        onClose={() => setSettings(null)}
        onPreview={openTool}
      />
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className="rounded-3xl p-6 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add context</DialogTitle>
            <DialogDescription>
              Select the materials your conversation should use.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal">
              <Checkbox
                id="context-greenhouse"
                checked={sourceSelected}
                onCheckedChange={setSourceSelected}
              />
              <FieldLabel htmlFor="context-greenhouse">
                Greenhouse study notes
              </FieldLabel>
            </Field>
          </FieldGroup>
          <Button onClick={() => setContextOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function GenerationDialog({
  tool,
  onClose,
  onPreview,
}: {
  tool: Tool | null
  onClose: () => void
  onPreview: (tool: Tool) => void
}) {
  const [template, setTemplate] = useState("detailed")
  const [difficulty, setDifficulty] = useState("medium")
  const [count, setCount] = useState(5)
  const [types, setTypes] = useState(["Multiple choice"])
  const [focus, setFocus] = useState("")
  const title = tool
    ? tools.find((item) => item.id === tool)?.label
    : "Study set"
  return (
    <Dialog
      open={tool !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-3xl p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Generate {title}</DialogTitle>
          <DialogDescription>
            Choose how you want to study your selected materials.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {tool === "summary" ? (
            <FieldSet>
              <FieldLegend>Templates</FieldLegend>
              <ToggleGroup
                value={[template]}
                onValueChange={(values) => {
                  if (values[0]) setTemplate(values[0])
                }}
                className="w-full flex-col items-stretch"
                variant="outline"
              >
                {[
                  {
                    id: "detailed",
                    label: "Detailed Summary",
                    detail: "A comprehensive overview",
                  },
                  {
                    id: "cheat",
                    label: "Cheat Sheet",
                    detail: "Concise bullets for quick reference",
                  },
                  {
                    id: "short",
                    label: "Short Summary",
                    detail: "Essential information only",
                  },
                ].map((item) => (
                  <ToggleGroupItem
                    key={item.id}
                    value={item.id}
                    className="h-auto justify-start rounded-xl p-3 text-left"
                  >
                    <span>
                      <span className="block">{item.label}</span>
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>
          ) : (
            <>
              {tool === "quiz" && (
                <FieldSet>
                  <FieldLegend>Question types</FieldLegend>
                  <ToggleGroup
                    multiple
                    value={types}
                    onValueChange={(values) => setTypes(values as string[])}
                    className="w-full flex-wrap justify-start"
                    variant="outline"
                  >
                    {[
                      "Multiple choice",
                      "Multi select",
                      "Free response",
                      "True or false",
                      "Fill in the blank",
                    ].map((type) => (
                      <ToggleGroupItem key={type} value={type}>
                        {type}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
              <FieldSet>
                <FieldLegend>Difficulty</FieldLegend>
                <ToggleGroup
                  value={[difficulty]}
                  onValueChange={(values) => {
                    if (values[0]) setDifficulty(values[0])
                  }}
                  variant="outline"
                >
                  {["easy", "medium", "hard"].map((level) => (
                    <ToggleGroupItem
                      key={level}
                      value={level}
                      className="capitalize"
                    >
                      {level}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
              <Field>
                <FieldLabel htmlFor="generation-count">
                  Number of {tool === "flashcards" ? "cards" : "questions"}
                </FieldLabel>
                <Input
                  id="generation-count"
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
                <FieldDescription>
                  This opens a fixed sample. These settings are not sent to a
                  generation service.
                </FieldDescription>
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor="generation-focus">
              What should it focus on?
            </FieldLabel>
            <Textarea
              id="generation-focus"
              placeholder="Focus on the parts about…"
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
            />
          </Field>
          <FieldDescription>
            Selected source: Greenhouse study notes · English
          </FieldDescription>
        </FieldGroup>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !tool ||
              (tool !== "summary" && (count < 1 || count > 20)) ||
              (tool === "quiz" && types.length === 0)
            }
            onClick={() => {
              if (tool) onPreview(tool)
            }}
          >
            Open sample {title?.toLowerCase()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
