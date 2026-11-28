"use client"

import Link from "next/link"
import {
  ArrowRight,
  Check,
  CursorPointer,
  Folder,
  MicrophoneSolid,
  Notes,
  Page,
  PlaySolid,
  Upload,
} from "iconoir-react"
import { useInView, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

const steps = [
  [
    "upload",
    "Upload anything",
    "Start with a lecture, a PDF, a video, or your own notes.",
  ],
  [
    "processed",
    "Learn it the fun way",
    "Turn your class materials into flashcards and quizzes.",
  ],
] as const

const surface =
  "overflow-hidden rounded-2xl bg-white text-foreground shadow-surface"
const paper = "rounded-xl bg-white shadow-paper"
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
const settle =
  "motion-safe:group-data-[playing=true]:animate-in fade-in-40 slide-in-from-top-2 animation-duration-500 fill-mode-backwards"
const highlight =
  "box-decoration-clone bg-linear-to-r from-emerald-100 to-emerald-100 bg-no-repeat text-inherit motion-safe:group-data-[playing=true]:animate-source-highlight"

function UploadPreview({ onComplete }: { onComplete: () => void }) {
  const tile =
    "relative grid size-(--tile-size) place-items-center rounded-[25%] shadow-sm [&>svg]:size-1/2"
  const stamp =
    "absolute top-[48%] bg-inherit px-px text-[clamp(.5rem,.85vw,.68rem)] leading-none font-bold tracking-tight"
  return (
    <div
      role="img"
      aria-label="Upload preview. A document, PDF, video, and audio recording drop into a class together."
      className="grid gap-(--tray-gap) [--drop-distance:calc(var(--tile-size)/2+var(--tray-gap)+var(--tray-height)/2-1.15rem)] [--tile-size:clamp(2.8rem,5.2vw,4.3rem)] [--tray-gap:clamp(1.15rem,2vw,1.7rem)] [--tray-height:clamp(9.5rem,17vw,15rem)]"
    >
      <div
        aria-hidden="true"
        className="relative z-1 flex justify-center gap-[clamp(.75rem,1.8vw,1.65rem)] motion-safe:group-data-[playing=true]:animate-file-drop"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) onComplete()
        }}
      >
        <span
          className={cn(
            tile,
            "-rotate-8 bg-blue-50 text-blue-600 [&_path:not(:first-child)]:hidden"
          )}
        >
          <Page />
          <b className={cn(stamp, "text-[clamp(.6rem,1.1vw,.9rem)]")}>W</b>
        </span>
        <span
          className={cn(
            tile,
            "-rotate-3 bg-orange-50 text-red-600 [&_path:not(:first-child)]:hidden"
          )}
        >
          <Page />
          <b className={stamp}>PDF</b>
        </span>
        <span className={cn(tile, "rotate-3 bg-red-50 text-red-600")}>
          <span className="grid aspect-[1.45] w-[57%] place-items-center rounded-[24%] bg-current">
            <PlaySolid className="size-1/2 text-white" />
          </span>
        </span>
        <span className={cn(tile, "rotate-8 bg-violet-50 text-violet-600")}>
          <MicrophoneSolid />
        </span>
      </div>
      <div
        aria-hidden="true"
        className="relative grid h-(--tray-height) place-items-center rounded-2xl border border-dashed border-foreground/15 bg-neutral-50/60 text-center"
      >
        <div className="grid justify-items-center gap-1 leading-tight motion-safe:group-data-[playing=true]:animate-drop-prompt">
          <Upload className="mb-1.5 size-9 text-muted-foreground" />
          <strong className="text-lg font-semibold tracking-tight">
            Drop files here
          </strong>
          <span className="text-sm text-muted-foreground">
            Documents, videos, and recordings
          </span>
        </div>
        <span className="absolute top-[calc(50%+1.45rem)] inline-flex items-center gap-1 text-sm text-muted-foreground opacity-0 motion-safe:group-data-[playing=true]:animate-drop-receipt">
          <Check className="size-4 text-plan-foreground" /> 4 materials
          processed
        </span>
      </div>
    </div>
  )
}

const questions = [
  {
    prompt: "Which organelle stores most of a eukaryotic cell’s DNA?",
    options: ["Golgi apparatus", "Nucleus", "Lysosome", "Vacuole"],
    answers: [1],
  },
  {
    prompt: "Which of these are membrane-bound structures?",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"],
    answers: [0, 1, 3],
  },
] as const

// Give the reader time to see each selection before the deck moves.
const quizCues = [
  { question: 0, picked: 0, hold: 900 },
  { question: 0, picked: 1, hold: 1450 },
  { question: 1, picked: 0, hold: 1200 },
  { question: 1, picked: 1, hold: 700 },
  { question: 1, picked: 2, hold: 700 },
  { question: 1, picked: 3, hold: 0 },
] as const

function QuizPreview({ playing }: { playing: boolean }) {
  const [cueIndex, setCueIndex] = useState(0)
  const reducedMotion = useReducedMotion()
  const cue = quizCues[playing && reducedMotion ? 1 : cueIndex] ?? quizCues[0]
  useEffect(() => {
    if (!playing || reducedMotion || !cue.hold) return
    const timer = window.setTimeout(
      () => setCueIndex((index) => Math.min(index + 1, quizCues.length - 1)),
      cue.hold
    )
    return () => window.clearTimeout(timer)
  }, [playing, reducedMotion, cue])

  const sheet =
    "rounded-xl bg-white px-4 py-4 shadow-[0_2px_3px_#1919190b,0_2px_0_#e6e4e0] ring-1 ring-stone-200/80 sm:px-6 sm:py-5"
  const row =
    "flex items-center rounded-lg bg-white px-3 text-sm leading-tight text-stone-700 shadow-[0_2px_0_#eae8e4] ring-1 ring-inset ring-stone-200/80 sm:px-4"
  const cursorRows = [
    "translate-y-0",
    "translate-y-full",
    "translate-y-[200%]",
    "translate-y-[300%]",
  ] as const

  return (
    <div
      role="group"
      aria-label="Practice questions from a cell biology lesson"
      className="relative overflow-hidden mask-[linear-gradient(to_bottom,transparent,black_21%,black_79%,transparent)] [--quiz-gap:clamp(1rem,2vw,1.65rem)] [--quiz-height:clamp(16rem,21vw,17.6rem)]"
    >
      <div className="absolute inset-x-[7.5%] top-1/2 h-(--quiz-height) -translate-y-1/2">
        <div
          className={cn(
            "relative grid gap-(--quiz-gap) motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-in-out",
            cue.question === 1 &&
              "-translate-y-[calc(var(--quiz-height)+var(--quiz-gap))]"
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              sheet,
              "absolute inset-x-[3%] bottom-full mb-(--quiz-gap) opacity-35"
            )}
          >
            <p className={cn(row, "h-9")}>True</p>
            <p className={cn(row, "mt-2 h-9")}>False</p>
          </div>
          {questions.map((question, index) => {
            const active = index === cue.question
            const answers: readonly number[] = question.answers
            const picked = active ? cue.picked : 0
            const target = answers[Math.min(picked, answers.length - 1)] ?? 0
            return (
              <div
                key={question.prompt}
                aria-hidden={!active}
                className={cn(
                  sheet,
                  "grid h-(--quiz-height) grid-rows-[auto_minmax(0,1fr)] gap-4 transition-[scale,opacity] motion-reduce:transition-none",
                  !active && "scale-95 opacity-35"
                )}
              >
                <h3 className="text-base leading-tight font-semibold tracking-tight text-stone-800">
                  {question.prompt}
                </h3>
                <div className="relative min-h-0">
                  <ul className="grid h-full grid-rows-4 gap-2">
                    {question.options.map((option, i) => {
                      const selected = answers.slice(0, picked).includes(i)
                      return (
                        <li
                          key={option}
                          className={cn(
                            row,
                            "motion-safe:transition-colors",
                            selected &&
                              "bg-[#d4e5d8] shadow-[0_2px_0_#63896d] ring-emerald-800/30"
                          )}
                        >
                          {option}
                          {selected && (
                            <span className="sr-only">, correct</span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {active && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 grid h-1/4 place-items-center motion-safe:transition-[translate,opacity] motion-safe:duration-500 motion-reduce:hidden",
                        cursorRows[target],
                        picked === answers.length && "opacity-0"
                      )}
                    >
                      <CursorPointer className="size-4 fill-white text-stone-800 drop-shadow-sm" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div
            aria-hidden="true"
            className={cn(sheet, "mx-[3%] h-28 opacity-35")}
          >
            <strong className="text-sm font-semibold">Wrap up</strong>
            <p className="mt-2 text-sm leading-tight">
              Ribosomes make proteins without a surrounding membrane.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function LessonPreview() {
  const [step, setStep] = useState<(typeof steps)[number][0]>("upload")
  const [replay, setReplay] = useState(0)
  const frame = useRef<HTMLDivElement>(null)
  const inView = useInView(frame, { amount: 0.55 })
  const scene =
    "group absolute inset-0 grid aria-hidden:pointer-events-none aria-hidden:opacity-0 motion-safe:transition-opacity motion-safe:duration-300"

  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-10 lg:gap-20">
      <div
        role="group"
        aria-label="Choose a lesson preview"
        className="grid gap-3 md:gap-8"
      >
        {steps.map(([id, title, description]) => (
          <button
            type="button"
            key={id}
            aria-pressed={step === id}
            aria-controls="lesson-preview"
            onClick={() => {
              setReplay((n) => n + 1)
              setStep(id)
            }}
            className={cn(
              focusRing,
              "border-s-4 border-stone-300 py-1.5 ps-3.5 text-start text-stone-500 aria-pressed:border-stone-800 aria-pressed:text-stone-800 md:ps-5"
            )}
          >
            <strong className="block text-xl leading-tight font-semibold tracking-tight md:text-2xl lg:text-[1.85rem]">
              {title}
            </strong>
            <span className="mt-1.5 block max-w-sm text-sm leading-snug md:text-base">
              {description}
            </span>
          </button>
        ))}
      </div>
      <div
        id="lesson-preview"
        ref={frame}
        className={cn(
          surface,
          "relative isolate h-96 w-full min-w-0 rounded-xl sm:h-[26rem] md:aspect-[6/5] md:h-auto md:min-h-96"
        )}
      >
        <div
          className={cn(
            scene,
            "content-center p-5 aria-hidden:**:[animation-play-state:paused] sm:p-8 lg:p-12"
          )}
          aria-hidden={step !== "upload"}
          data-playing={inView}
        >
          <UploadPreview
            key={replay}
            onComplete={() => {
              if (inView && step === "upload") setStep("processed")
            }}
          />
        </div>
        <div
          className={scene}
          aria-hidden={step !== "processed"}
          data-playing={inView && step === "processed"}
        >
          <QuizPreview key={replay} playing={inView && step === "processed"} />
        </div>
      </div>
    </div>
  )
}

function MaterialsArt() {
  const slip = cn(
    settle,
    "absolute flex items-center gap-2 rounded-xl bg-white px-4 pt-2.5 pb-6 shadow-paper [&>svg]:size-4"
  )
  return (
    <div className="absolute -bottom-8 left-[7%] h-48 w-[86%] origin-bottom-left -rotate-4 text-sm leading-tight font-medium">
      <div className={cn(slip, "inset-x-8 top-0 rotate-3")}>
        <Page /> Lecture notes.pdf
      </div>
      <div
        className={cn(slip, "inset-x-5 top-8 rotate-1 [animation-delay:80ms]")}
      >
        <MicrophoneSolid /> Class recording
      </div>
      <div
        className={cn(
          slip,
          "inset-x-3 top-16 -rotate-1 [animation-delay:160ms]"
        )}
      >
        <Notes /> Seminar notes
      </div>
      <div
        className={cn(
          paper,
          "absolute inset-x-0 top-24 -bottom-2 flex items-start gap-2 bg-neutral-50 px-5 pt-5"
        )}
      >
        <Folder className="size-4 text-plan-foreground" /> Machine learning
      </div>
    </div>
  )
}

function CitationArt() {
  return (
    <>
      <div
        className={cn(
          paper,
          "absolute top-7 -right-[5%] min-h-52 w-[92%] -rotate-3 py-5 pr-[12%] pl-5 sm:pl-7"
        )}
      >
        <small className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Page className="size-4" /> Lecture notes{" "}
          <span className="ml-auto">p. 2</span>
        </small>
        <p className="mt-2 max-w-[32ch] text-base leading-tight tracking-tight sm:text-lg">
          The mean absolute error is the{" "}
          <mark className={highlight}>
            average distance between a prediction and its observed value.
          </mark>
        </p>
      </div>
      <span
        className={cn(
          settle,
          "absolute bottom-5 left-[7%] inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-paper [animation-delay:120ms]"
        )}
      >
        <Page className="size-3.5" /> Source · page 2
      </span>
    </>
  )
}

function FlashcardArt() {
  const side = cn(
    paper,
    "absolute top-9 h-36 w-[48%] p-4 text-sm leading-tight font-medium motion-safe:group-data-[playing=true]:animate-paper-fan sm:p-5"
  )
  const face = cn(
    paper,
    "absolute inset-0 flex flex-col gap-1.5 p-5 text-base leading-[1.18] tracking-tight backface-hidden sm:text-lg"
  )
  const label = "text-xs font-medium tracking-normal text-muted-foreground"
  return (
    <>
      <div
        className={cn(side, "-left-[3%] origin-bottom-right -rotate-9 ps-6")}
      >
        <small className={label}>Question</small>
        <p className="mt-1.5">Why take absolute values?</p>
      </div>
      <div className={cn(side, "-right-[10%] origin-bottom-left rotate-8")}>
        <small className={label}>Question</small>
        <p className="mt-1.5">Can an error be negative?</p>
      </div>
      <div className="absolute -bottom-7 left-[23%] h-[10.25rem] w-[53%] -rotate-3 perspective-[800px]">
        <div className="absolute inset-0 transform-[rotateY(180deg)] transform-3d motion-safe:group-data-[playing=true]:animate-flashcard-turn">
          <div className={face}>
            <small className={label}>Question</small>What does an error of zero
            mean?
          </div>
          <div className={cn(face, "rotate-y-180")}>
            <small className={label}>Answer</small>The prediction matches the
            observed value.
          </div>
        </div>
      </div>
    </>
  )
}

function PracticeArt() {
  return (
    <>
      <div
        className={cn(
          paper,
          "absolute top-7 -left-2 grid min-h-48 w-[85%] origin-top-left -rotate-2 content-start gap-1.5 py-5 pr-5 pl-8 text-sm leading-tight sm:w-4/5"
        )}
      >
        <strong className="mb-1 font-semibold">
          Which prediction is closest to 10?
        </strong>
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="size-3 rounded-full border border-foreground/25" />6
        </div>
        <div
          className={cn(
            settle,
            "flex items-center gap-2 rounded-md bg-plan px-2 py-1 text-emerald-800"
          )}
        >
          <Check className="size-3" />9
        </div>
      </div>
      <p
        className={cn(
          paper,
          settle,
          "absolute right-[6%] bottom-5 max-w-[63%] rotate-2 px-4 py-3 text-sm leading-tight [animation-delay:250ms]"
        )}
      >
        <strong className="mb-1 block text-xs font-semibold text-emerald-800">
          Correct
        </strong>
        9 is only one point away.
      </p>
    </>
  )
}

const tools = [
  {
    title: "Keep a class together",
    description:
      "Collect readings, recordings, and notes in one course folder.",
    href: "/features#materials",
    Art: MaterialsArt,
  },
  {
    title: "Trace an answer to its source",
    description: "Follow a citation straight to the passage behind an answer.",
    href: "/features#understand",
    Art: CitationArt,
  },
  {
    title: "Recall it in your own words",
    description: "Try a flashcard, then flip it to check your thinking.",
    href: "/features#practise",
    Art: FlashcardArt,
  },
  {
    title: "Check what stuck",
    description: "Practise with questions drawn from your own lessons.",
    href: "/features#practise",
    Art: PracticeArt,
  },
] as const

function ToolCard({ title, description, href, Art }: (typeof tools)[number]) {
  const link = useRef<HTMLAnchorElement>(null)
  const inView = useInView(link, { once: true, amount: 0.25 })
  const [replay, setReplay] = useState(0)
  return (
    <Link
      ref={link}
      href={href}
      className={cn(
        surface,
        focusRing,
        "grid grid-rows-[1fr_auto] hover:shadow-md motion-safe:transition-shadow"
      )}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setReplay((n) => n + 1)
      }}
      onFocus={() => setReplay((n) => n + 1)}
    >
      <div className="grid grid-cols-[1fr_auto] content-start items-center gap-x-2 gap-y-0.5 px-5 pt-5 pb-2 sm:px-6 sm:pt-6">
        <h3 className="text-xl leading-[1.12] font-semibold tracking-tight lg:text-2xl">
          {title}
        </h3>
        <ArrowRight
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        <p className="col-span-full text-sm leading-tight text-muted-foreground lg:text-[.94rem]">
          {description}
        </p>
      </div>
      <div
        aria-hidden="true"
        className="group pointer-events-none relative isolate h-48 overflow-hidden bg-white sm:h-52"
        key={replay}
        data-playing={inView}
      >
        <Art />
      </div>
    </Link>
  )
}

export function LandingFeaturePreviews() {
  return (
    <section
      id="study-tools"
      aria-labelledby="study-heading"
      className="scroll-mt-20 bg-[#f8f7fa] py-12 font-sans md:py-16"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2
          id="study-heading"
          className="mb-8 text-center text-[clamp(2rem,3.7vw,2.8rem)] leading-[1.08] font-semibold tracking-[-.04em] text-balance md:mb-12"
        >
          Abstruck makes learning{" "}
          <span className="text-violet-700">simple</span>.
        </h2>
        <LessonPreview />
        <div className="mt-8 grid gap-4 md:mt-14 md:grid-cols-2 md:gap-6">
          {tools.map((tool) => (
            <ToolCard key={tool.title} {...tool} />
          ))}
        </div>
      </div>
    </section>
  )
}
