"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  CheckCircle,
  Book,
  Download,
  EditPencil,
  Leaf,
  NavArrowLeft,
  NavArrowRight,
  Star,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Progress } from "@workspace/ui/components/progress"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel, FieldGroup } from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { Spinner } from "@workspace/ui/components/spinner"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import { FlashcardFace } from "./study-tools-flashcard-card"
import { ShareOutputAction } from "./sharing-dialog"
import {
  studyRequest,
  studyError,
  exportStudyMarkdown,
  StudyApiError,
  type StudyCard,
  type StudyCitation,
  type StudySetDetail,
  type FlashcardReviewMode,
  type FlashcardReviewSession,
  type FlashcardReviewStatus,
} from "./study-tools-types"

export function StudyFlashcards({
  detail,
  onChanged,
  onBack,
  onCitation,
}: {
  detail: StudySetDetail
  onChanged: (detail: StudySetDetail) => void
  onBack: () => void
  onCitation: (citation: StudyCitation) => void
}) {
  const searchParams = useSearchParams()
  const requestedReview = searchParams.get("review")
  const [mode, setMode] = useState<FlashcardReviewMode>("spaced")
  const [session, setSession] = useState<FlashcardReviewSession | null>(null)
  const [status, setStatus] = useState<FlashcardReviewStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [fastIndex, setFastIndex] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState<{
    card: StudyCard
    revision: number
  } | null>(null)
  const [front, setFront] = useState("")
  const [back, setBack] = useState("")
  const [explanation, setExplanation] = useState("")
  const [editConflict, setEditConflict] = useState(false)
  const [nextDueAt, setNextDueAt] = useState<string | null>(null)
  const saving = useRef(false)
  const ratingRequest = useRef<{
    cardId: string
    rating: string
    requestId: string
  } | null>(null)
  const endpoint = `/api/study-sets/${detail.studySet.id}`
  const locked = busy || loading
  const current =
    session?.mode === "fast"
      ? session.cards[fastIndex]
      : session?.cards.find(
          (card) => !session.reviewedCardIds.includes(card.id)
        )
  const notStudied = detail.items.filter((card) => !card.review?.due_at).length
  const dueReview = detail.items.filter(
    (card) => card.review?.due_at && Date.parse(card.review.due_at) <= now
  ).length
  const studied = detail.items.length - notStudied
  const due = notStudied + dueReview
  const activeSpaced = status?.active.spaced
  const remaining = session
    ? session.cards.length - session.reviewedCardIds.length
    : 0

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const query = requestedReview
      ? `?attemptId=${encodeURIComponent(requestedReview)}`
      : ""
    studyRequest<FlashcardReviewStatus>(`${endpoint}/review${query}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return
        setStatus(result)
        setNow(Date.parse(result.serverTime))
        setSession(result.session)
        setError("")
        if (result.session) {
          const saved = result.session
          setMode(saved.mode)
          setFastIndex(
            Math.max(
              0,
              saved.cards.findIndex(
                (card) => !saved.reviewedCardIds.includes(card.id)
              )
            )
          )
          setRevealed(false)
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(studyError(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [endpoint, requestedReview, refresh])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  function rememberReview(attemptId: string | null) {
    const url = new URL(window.location.href)
    if (attemptId) url.searchParams.set("review", attemptId)
    else url.searchParams.delete("review")
    window.history.replaceState(null, "", url)
  }

  async function start(nextMode: FlashcardReviewMode = mode) {
    if (saving.current || loading) return
    saving.current = true
    setBusy(true)
    setError("")
    try {
      const result = await studyRequest<FlashcardReviewSession>(
        `${endpoint}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "start",
            mode: nextMode,
            requestId: crypto.randomUUID(),
          }),
        }
      )
      setMode(result.mode)
      setSession(result)
      setRevealed(false)
      setNextDueAt(null)
      setFastIndex(
        Math.max(
          0,
          result.cards.findIndex(
            (card) => !result.reviewedCardIds.includes(card.id)
          )
        )
      )
      rememberReview(result.attemptId)
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function menu() {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setSession(null)
    setMode("spaced")
    setRevealed(false)
    rememberReview(null)
    try {
      onChanged(await studyRequest<StudySetDetail>(endpoint))
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function moveFast(direction: -1 | 1) {
    if (!session || locked) return
    setFastIndex((index) =>
      Math.max(0, Math.min(session.cards.length - 1, index + direction))
    )
    setRevealed(false)
  }

  async function rate(rating: "again" | "got_it") {
    if (!session || !current || saving.current || loading || !revealed) return
    if (session.reviewedCardIds.includes(current.id)) {
      const next = session.cards.findIndex(
        (card) => !session.reviewedCardIds.includes(card.id)
      )
      if (next >= 0) setFastIndex(next)
      setRevealed(false)
      return
    }
    saving.current = true
    setBusy(true)
    setError("")
    if (
      ratingRequest.current?.cardId !== current.id ||
      ratingRequest.current.rating !== rating
    )
      ratingRequest.current = {
        cardId: current.id,
        rating,
        requestId: crypto.randomUUID(),
      }
    try {
      const result = await studyRequest<{
        reviewedCardIds: string[]
        completed: boolean
        nextDueAt: string | null
      }>(`${endpoint}/review`, {
        method: "POST",
        body: JSON.stringify({
          action: "rate",
          attemptId: session.attemptId,
          ...ratingRequest.current,
        }),
      })
      setSession({
        ...session,
        reviewedCardIds: result.reviewedCardIds,
        completed: result.completed,
      })
      setNextDueAt(result.nextDueAt)
      setRevealed(false)
      ratingRequest.current = null
      if (session.mode === "fast") {
        const next = session.cards.findIndex(
          (card, index) =>
            index > fastIndex && !result.reviewedCardIds.includes(card.id)
        )
        const first = session.cards.findIndex(
          (card) => !result.reviewedCardIds.includes(card.id)
        )
        setFastIndex(next >= 0 ? next : Math.max(0, first))
      } else {
        const identity = current.logicalId ?? current.logical_id ?? current.id
        onChanged({
          ...detail,
          items: detail.items.map((card) =>
            (card.logicalId ?? card.logical_id ?? card.id) === identity &&
            card.prompt.front === current.prompt.front &&
            card.answer.back === current.answer.back &&
            card.answer.explanation === current.answer.explanation
              ? {
                  ...card,
                  review: {
                    starred: card.review?.starred ?? false,
                    due_at: result.nextDueAt,
                  },
                }
              : card
          ),
        })
        setNow(Date.now())
      }
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function star(card: StudyCard) {
    if (saving.current || loading) return
    saving.current = true
    setBusy(true)
    setError("")
    try {
      const starred = !card.review?.starred
      await studyRequest(`${endpoint}/cards`, {
        method: "PATCH",
        body: JSON.stringify({ cardId: card.id, starred }),
      })
      const identity = card.logicalId ?? card.logical_id ?? card.id
      const update = (item: StudyCard): StudyCard =>
        (item.logicalId ?? item.logical_id ?? item.id) === identity
          ? {
              ...item,
              review: { due_at: item.review?.due_at ?? null, starred },
            }
          : item
      onChanged({ ...detail, items: detail.items.map(update) })
      if (session) setSession({ ...session, cards: session.cards.map(update) })
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function edit(card: StudyCard) {
    const identity = card.logicalId ?? card.logical_id ?? card.id
    const latest =
      detail.items.find(
        (item) => (item.logicalId ?? item.logical_id ?? item.id) === identity
      ) ?? card
    setEditing({ card: latest, revision: detail.studySet.revision })
    setFront(latest.prompt.front)
    setBack(latest.answer.back)
    setExplanation(latest.answer.explanation ?? "")
    setEditConflict(false)
    setError("")
  }

  async function loadLatestCard() {
    if (!editing || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const latest = await studyRequest<StudySetDetail>(endpoint)
      const identity =
        editing.card.logicalId ?? editing.card.logical_id ?? editing.card.id
      const card = latest.items.find(
        (item) => (item.logicalId ?? item.logical_id ?? item.id) === identity
      )
      if (!card)
        throw new StudyApiError(
          "This card is no longer in the deck. Your draft is still here.",
          409
        )
      onChanged(latest)
      setEditing({ card, revision: latest.studySet.revision })
      setFront(card.prompt.front)
      setBack(card.answer.back)
      setExplanation(card.answer.explanation ?? "")
      setEditConflict(false)
      setError("")
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function saveCard() {
    if (!editing || saving.current || editConflict) return
    saving.current = true
    setBusy(true)
    setError("")
    try {
      const updated = await studyRequest<StudySetDetail>(`${endpoint}/cards`, {
        method: "PATCH",
        body: JSON.stringify({
          cardId: editing.card.id,
          front: front.trim(),
          back: back.trim(),
          explanation: explanation.trim(),
          revision: editing.revision,
        }),
      })
      onChanged(updated)
      setEditing(null)
      setSession(null)
      rememberReview(null)
      setRefresh((value) => value + 1)
    } catch (cause) {
      if (cause instanceof StudyApiError && cause.status === 409)
        setEditConflict(true)
      setError(studyError(cause))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function exportDeck() {
    const content = detail.items
      .map(
        (card) =>
          `## ${card.prompt.front}\n\n${card.answer.back}${card.answer.explanation ? `\n\n${card.answer.explanation}` : ""}`
      )
      .join("\n\n---\n\n")
    exportStudyMarkdown(
      detail.studySet.title,
      `# ${detail.studySet.title}\n\n${content}\n`
    )
  }

  const review = session ? (
    session.completed || !current ? (
      <Empty className="py-10">
        <EmptyHeader>
          <CheckCircle
            className="mx-auto size-10 text-plan-foreground"
            aria-hidden="true"
          />
          <EmptyTitle>
            {session.cards.length ? "Session complete" : "All caught up"}
          </EmptyTitle>
          <EmptyDescription>
            {session.reviewedCardIds.length} reviewed · {remaining} remaining.
            {session.mode === "fast"
              ? " Your spaced-review schedule is unchanged."
              : session.cards.length
                ? " Your progress is saved."
                : " Your next cards will appear when they’re due."}
          </EmptyDescription>
        </EmptyHeader>
        {nextDueAt && session.mode === "spaced" && (
          <p className="text-xs text-muted-foreground">
            Last card due {new Date(nextDueAt).toLocaleString()}.
          </p>
        )}
        <Button className="rounded-xl" onClick={() => void menu()}>
          Back to deck
        </Button>
      </Empty>
    ) : (
      <div className="flex flex-col gap-4" aria-busy={busy}>
        {session.mode === "spaced" && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit rounded-full"
              disabled={locked}
              onClick={() => void menu()}
            >
              <NavArrowLeft data-icon="inline-start" />
              Menu
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <span>{session.reviewedCardIds.length}</span>
              <Progress
                value={
                  (session.reviewedCardIds.length / session.cards.length) * 100
                }
                aria-label="Cards reviewed"
                className="flex-1"
              />
              <span>{session.cards.length}</span>
            </div>
          </>
        )}
        {session.versionId !== detail.version?.id && (
          <p className="text-xs leading-5 text-muted-foreground">
            This session keeps the cards you started with. Your edited deck is
            saved separately.
          </p>
        )}
        <FlashcardFace
          key={current.id}
          card={current}
          revealed={revealed}
          busy={locked}
          compact={session.mode === "spaced"}
          onReveal={() => setRevealed(!revealed)}
          onStar={() => void star(current)}
          onEdit={() => edit(current)}
          onCitation={onCitation}
        />
        {session.mode === "fast" && (
          <>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                disabled={locked || fastIndex === 0}
                aria-label="Previous card"
                onClick={() => moveFast(-1)}
              >
                <NavArrowLeft />
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums">
                {fastIndex + 1} / {session.cards.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl"
                disabled={locked || fastIndex === session.cards.length - 1}
                aria-label="Next card"
                onClick={() => moveFast(1)}
              >
                <NavArrowRight />
              </Button>
            </div>
            <p
              className="text-center text-xs text-muted-foreground"
              role="status"
            >
              {session.reviewedCardIds.length} reviewed · {remaining} remaining
            </p>
          </>
        )}
        {revealed && (
          <div className="grid grid-cols-2 gap-3">
            {session.mode === "spaced" && (
              <Button
                variant="outline"
                className="h-12 flex-col gap-0.5 rounded-xl"
                disabled={locked}
                onClick={() => void rate("again")}
              >
                Again
                <span className="text-xs font-normal text-muted-foreground">
                  10 minutes
                </span>
              </Button>
            )}
            <Button
              className={cn(
                "h-12 rounded-xl",
                session.mode === "fast" && "col-span-2"
              )}
              disabled={locked}
              onClick={() => void rate("got_it")}
            >
              {busy && <Spinner />}
              {session.mode === "spaced"
                ? "Got it"
                : session.reviewedCardIds.includes(current.id)
                  ? "Next unreviewed card"
                  : "Mark reviewed & next"}
            </Button>
          </div>
        )}
        {session.mode === "fast" && (
          <Button
            variant="ghost"
            className="mx-auto rounded-full"
            disabled={locked}
            onClick={() => void menu()}
          >
            Manage cards
          </Button>
        )}
      </div>
    )
  ) : null

  const management = (
    <section className="mt-7 flex flex-col gap-4">
      <h3 className="text-base">
        Flashcards{" "}
        <span className="text-muted-foreground">({detail.items.length})</span>
      </h3>
      {detail.items.length ? (
        detail.items.map((card, index) => (
          <article key={card.id} className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Card {index + 1}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={locked}
                  aria-label={`${card.review?.starred ? "Unstar" : "Star"} card ${index + 1}`}
                  aria-pressed={!!card.review?.starred}
                  onClick={() => void star(card)}
                >
                  <Star
                    aria-hidden="true"
                    className={cn(card.review?.starred && "fill-current")}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={locked}
                  aria-label={`Edit card ${index + 1}`}
                  onClick={() => edit(card)}
                >
                  <EditPencil aria-hidden="true" />
                </Button>
              </div>
            </div>
            <p className="text-sm leading-6 font-medium wrap-anywhere whitespace-pre-wrap">
              {card.prompt.front}
            </p>
            <p className="mt-3 text-sm leading-6 wrap-anywhere whitespace-pre-wrap text-muted-foreground">
              {card.answer.back}
            </p>
          </article>
        ))
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No cards yet</EmptyTitle>
            <EmptyDescription>
              Cards appear here when your deck is ready.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={locked}
          onClick={() => (session ? void menu() : onBack())}
          className="rounded-full"
        >
          <NavArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <h2 className="sr-only">{detail.studySet.title}</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Export flashcards"
            disabled={locked || !detail.items.length}
            onClick={exportDeck}
          >
            <Download />
          </Button>
          <ShareOutputAction
            studySetId={detail.studySet.id}
            versionId={session?.versionId ?? detail.version?.id}
            disabled={locked || !!editing}
          />
        </div>
      </div>
      {error && !editing && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-fit"
              disabled={locked}
              onClick={() => setRefresh((value) => value + 1)}
            >
              Reload saved review
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading && !session ? (
        <div
          className="flex flex-col gap-5"
          aria-label="Loading saved review"
          role="status"
        >
          <Skeleton className="mx-auto h-10 w-64 rounded-xl" />
          <Skeleton className="h-52 w-full rounded-2xl" />
          <span className="sr-only">Loading saved review…</span>
        </div>
      ) : session?.mode === "spaced" ? (
        review
      ) : (
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (locked) return
            const next = value === "fast" ? "fast" : "spaced"
            setMode(next)
            if (next === "fast") void start("fast")
            else void menu()
          }}
        >
          <TabsList
            className="mx-auto h-10 rounded-xl p-1"
            aria-label="Flashcard review mode"
          >
            <TabsTrigger
              value="spaced"
              disabled={locked}
              className="rounded-lg px-3 font-normal"
            >
              Spaced Repetition
            </TabsTrigger>
            <TabsTrigger
              value="fast"
              disabled={locked}
              className="rounded-lg px-3 font-normal"
            >
              Fast Review
            </TabsTrigger>
          </TabsList>
          <TabsContent value="spaced" className="pt-5">
            <h3 className="mb-4 text-base">Cards for today</h3>
            <div className="flex flex-col gap-5 rounded-2xl bg-muted/45 px-4 py-6 sm:px-6">
              <div className="flex items-center justify-center gap-5 sm:gap-8">
                <div
                  className="grid size-20 shrink-0 place-items-center rounded-full border-8 border-muted text-3xl tabular-nums"
                  aria-label={`${activeSpaced?.reviewedCardIds.length ?? 0} reviewed in saved session`}
                >
                  {activeSpaced?.reviewedCardIds.length ?? 0}
                </div>
                <div className="text-center">
                  <p className="flex items-center justify-center gap-1.5 text-2xl font-medium tabular-nums">
                    <Book
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {notStudied}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Not Studied
                  </p>
                </div>
                <div className="text-center">
                  <p className="flex items-center justify-center gap-1.5 text-2xl font-medium tabular-nums">
                    <Leaf
                      className="size-4 text-plan-foreground"
                      aria-hidden="true"
                    />
                    {dueReview}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    To review
                  </p>
                </div>
              </div>
              <Button
                disabled={locked || (!due && !activeSpaced)}
                onClick={() => void start("spaced")}
                className="mx-auto h-10 w-full max-w-72 rounded-xl"
              >
                {busy && <Spinner />}
                {activeSpaced
                  ? "Resume review"
                  : due
                    ? "Study Cards"
                    : "All caught up"}
              </Button>
              {activeSpaced && (
                <p className="text-center text-xs text-muted-foreground">
                  {activeSpaced.cards.length -
                    activeSpaced.reviewedCardIds.length}{" "}
                  remaining in your saved session
                </p>
              )}
            </div>
            <h3 className="mt-7 mb-4 text-base">Deck progress</h3>
            <div className="flex flex-col gap-3 rounded-2xl bg-muted/45 p-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full bg-muted-foreground/45"
                    aria-hidden="true"
                  />
                  {notStudied} Not Studied
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full bg-plan-foreground"
                    aria-hidden="true"
                  />
                  {dueReview} To review
                </span>
                <span>{studied} Studied</span>
              </div>
              <Progress
                value={
                  detail.items.length
                    ? (studied / detail.items.length) * 100
                    : 0
                }
                aria-label="Cards studied at least once"
              />
            </div>
            {management}
          </TabsContent>
          <TabsContent value="fast" className="pt-5">
            {review ?? (
              <Button
                disabled={locked || !detail.items.length}
                className="mx-auto flex rounded-xl"
                onClick={() => void start("fast")}
              >
                {busy && <Spinner />}Start Fast Review
              </Button>
            )}
          </TabsContent>
        </Tabs>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(null)
            setError("")
          }
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit flashcard</DialogTitle>
            <DialogDescription>
              Saving resets this card’s review schedule. Earlier sessions and
              shared versions keep their original card.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="card-front">Question</FieldLabel>
              <Textarea
                id="card-front"
                value={front}
                onChange={(event) => setFront(event.target.value)}
                maxLength={2000}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="card-back">Answer</FieldLabel>
              <Textarea
                id="card-back"
                value={back}
                onChange={(event) => setBack(event.target.value)}
                maxLength={5000}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="card-explanation">
                Explanation (optional)
              </FieldLabel>
              <Textarea
                id="card-explanation"
                value={explanation}
                onChange={(event) => setExplanation(event.target.value)}
                maxLength={5000}
                disabled={busy}
              />
            </Field>
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                {editConflict && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-auto whitespace-normal"
                    disabled={busy}
                    onClick={() => void loadLatestCard()}
                  >
                    Load latest card (replaces this draft)
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(null)
                setError("")
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || editConflict || !front.trim() || !back.trim()}
              onClick={() => void saveCard()}
            >
              {busy && <Spinner />}Save card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
