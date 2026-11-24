import Image from "next/image"
import Link from "next/link"
import { isProductionRelease, workspaceHref } from "@/lib/release"
import {
  ArrowRight,
  Page,
  SoundHigh,
  Notes,
  Folder,
  Play,
  ShareAndroid,
  ChatBubble,
  Network,
} from "iconoir-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { MarketingFaq } from "./marketing-faq"
import {
  LandingDemoScreenshot,
  LandingFeaturePreviews,
  UniversityCommunity,
} from "./landing-media"
import { Reveal } from "./motion"

const f6sListingHref =
  "https://www.f6s.com/companies/artificial-intelligence/philippines/co"

const sampleMaterials = [
  [Page, "The active recall guide", "PDF · 6 pages"],
  [Play, "How memories are made", "Lecture recording"],
  [Notes, "My chapter notes", "Pasted text"],
] as const

export function StartButton({
  children = "Start free",
}: {
  children?: React.ReactNode
}) {
  return (
    <Button
      size="lg"
      className="h-12 rounded-full px-5 has-data-[icon=inline-end]:pr-5"
      render={<Link href={workspaceHref("/sign-up")} prefetch={false} />}
      nativeButton={false}
    >
      {children}
      <ArrowRight data-icon="inline-end" />
    </Button>
  )
}

export function LandingContent() {
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <section className="mx-auto flex max-w-4xl flex-col items-center px-5 pt-20 pb-16 text-center sm:pt-28 sm:pb-24 lg:pt-32">
        <a
          href={f6sListingHref}
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Image
            src="/brands/f6s-badge.png"
            alt="F6S badge for Abstruck, #5 Top Company in AI, November 2026"
            width={1203}
            height={297}
            unoptimized
            className="block h-auto w-56 sm:w-64"
          />
        </a>
        <h1 className="mt-6 text-[clamp(2.25rem,5.5vw,4.25rem)] leading-[1.05] font-medium tracking-[-0.055em] text-balance text-foreground">
          Everything you study.
          <span className="block text-muted-foreground">
            One smart workspace.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-balance text-muted-foreground sm:text-lg">
          Turn class materials into notes, cited answers, and practice.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <StartButton />
          <a
            href="#study-tools"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "h-12 rounded-full px-6"
            )}
          >
            See features
          </a>
        </div>
      </section>

      <LandingDemoScreenshot />
      <UniversityCommunity />
      <LandingFeaturePreviews />
      <MarketingFaq />
      <section
        aria-labelledby="landing-signup-heading"
        className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24"
      >
        <Card className="items-center gap-7 rounded-3xl bg-linear-to-b from-card to-muted/35 px-6 py-14 text-center shadow-composer ring-border/70 sm:gap-9 sm:py-20">
          <CardHeader className="flex w-full max-w-4xl flex-col items-center gap-4 px-0">
            <h2
              id="landing-signup-heading"
              className="text-3xl leading-tight font-medium tracking-tight text-balance sm:text-5xl"
            >
              Turn your next lecture into{" "}
              <span className="rounded-lg bg-(--tool-flashcards-bg) px-2">
                flashcards.
              </span>
            </h2>
            <CardDescription className="max-w-lg text-base leading-relaxed text-balance sm:text-lg">
              Start with a recording, a slide deck, or a PDF from class.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StartButton>Create my free workspace</StartButton>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

export function FeatureStory() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <Reveal>
        <section
          id="materials"
          className="grid scroll-mt-28 items-center gap-10 py-20 sm:py-28 md:grid-cols-[0.85fr_1.15fr]"
        >
          <div>
            <p className="mb-4 text-xs tracking-widest text-muted-foreground uppercase">
              01 / Bring your materials
            </p>
            <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl">
              Your course.
              <br />
              <span className="text-muted-foreground">
                A place for all its pieces.
              </span>
            </h2>
            <p className="mt-6 max-w-md leading-7 text-muted-foreground">
              Keep lecture slides, readings and recordings in spaces and
              folders. Open a source and keep your study work beside it.
            </p>
            <p className="mt-5 text-xs leading-6 text-muted-foreground">
              PDF · DOCX · PPTX · Text · Audio/video · Individual YouTube links
            </p>
          </div>
          <div className="rounded-3xl border border-border/60 bg-muted/35 p-5 sm:p-9">
            <div className="rounded-2xl border border-border/60 bg-background p-5 shadow-composer">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-info">
                  <Folder className="size-5 text-info-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium">Memory & learning</p>
                  <p className="text-xs text-muted-foreground">
                    Fictional sample space
                  </p>
                </div>
              </div>
              <div className="mt-7 flex flex-col gap-1">
                {sampleMaterials.map(([Icon, title, detail]) => (
                  <div
                    key={title}
                    className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-4"
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm">{title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section
          id="understand"
          className="grid scroll-mt-28 items-center gap-10 py-12 sm:py-20 md:grid-cols-[1.15fr_0.85fr]"
        >
          <div className="order-2 rounded-3xl border border-info-border/50 bg-info/50 p-5 sm:p-9 md:order-1">
            <div className="rounded-2xl border border-border/60 bg-background p-6 shadow-composer">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ChatBubble className="size-4" />
                Prepared sample · Source-grounded chat
              </p>
              <p className="mt-7 text-lg font-medium">
                How are the three stages connected?
              </p>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Encoding gives information meaning. Storage keeps it available.
                Retrieval brings it back when you need it.
              </p>
              <Badge variant="outline" className="mt-5">
                <Page className="size-3" /> Sample source · Page 1
              </Badge>
              <div className="mt-6 rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground">
                “Memory involves encoding, storage and retrieval.”
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 md:pl-8">
            <p className="mb-4 text-xs tracking-widest text-muted-foreground uppercase">
              02 / Understand
            </p>
            <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl">
              Ask a question.
              <br />
              <span className="text-muted-foreground">
                Keep the source close.
              </span>
            </h2>
            <p className="mt-6 leading-7 text-muted-foreground">
              Ask about selected materials and follow citations to the relevant
              page or timestamp. Keep summaries and your own notes with the
              work.
            </p>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              AI can make mistakes. Check the cited material when something is
              unclear.
            </p>
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section
          id="practise"
          className="grid scroll-mt-28 items-center gap-10 py-16 sm:py-24 md:grid-cols-[0.85fr_1.15fr]"
        >
          <div>
            <p className="mb-4 text-xs tracking-widest text-muted-foreground uppercase">
              03 / Practise & review
            </p>
            <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl">
              Find your words.
              <br />
              <span className="text-muted-foreground">
                Then see what sticks.
              </span>
            </h2>
            <p className="mt-6 leading-7 text-muted-foreground">
              Write notes, reveal flashcards and try quizzes or practice exams.
              Return to saved work and pick up your next review.
            </p>
            <Button
              variant="ghost"
              className="mt-6 h-11"
              render={<a href="#product-demo" />}
              nativeButton={false}
            >
              Try a sample study activity
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          <div className="grid gap-4 rounded-3xl bg-muted/40 p-5 sm:p-9">
            <div className="rounded-2xl border border-border/60 bg-background p-6">
              <p className="text-xs text-muted-foreground">
                MY STUDY NOTES · SAMPLE
              </p>
              <p className="mt-5 text-xl tracking-tight">
                A little less rereading.
              </p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Close my notes. Explain the idea in my own words. Check what I
                missed.
              </p>
            </div>
            <div className="rounded-2xl border border-info-border/60 bg-info p-6">
              <p className="text-xs text-info-foreground">READY TO REVISIT</p>
              <p className="mt-4 text-lg">What is retrieval?</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Bringing information back to mind.
              </p>
            </div>
          </div>
        </section>
      </Reveal>
      <section
        id="formats"
        className="scroll-mt-28 border-y border-border/60 py-14"
      >
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="max-w-md">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
              A different way into the same idea.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Use saved mind maps, flowcharts, timelines and data charts, or
              revisit material through generated podcasts and narrated study
              videos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:max-w-sm">
            {[
              [Network, "Visual study outputs"],
              [SoundHigh, "Podcasts & study videos"],
              [ShareAndroid, "Read-only sharing"],
            ].map(([Icon, label]) => {
              const FormatIcon = Icon as typeof Network
              return (
                <div
                  key={String(label)}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm"
                >
                  <FormatIcon className="size-5 text-muted-foreground" />
                  {String(label)}
                </div>
              )
            })}
          </div>
        </div>
        {!isProductionRelease() && (
          <p className="mt-6 text-xs leading-6 text-muted-foreground">
            Current development capabilities. Public availability remains
            subject to release validation.
          </p>
        )}
      </section>
    </div>
  )
}

export function FinalCta() {
  return (
    <section className="mx-5 my-16 rounded-[2rem] border border-border/50 bg-muted/30 px-6 py-16 text-center sm:mx-auto sm:my-24 sm:max-w-5xl sm:py-20">
      <h2 className="text-3xl leading-tight font-medium tracking-tight sm:text-5xl">
        A clearer place to start.
      </h2>
      <p className="mx-auto mt-5 max-w-md leading-7 text-muted-foreground">
        Bring the material you’re working through.
        <br />
        Make space to understand it.
      </p>
      <div className="mt-7">
        <StartButton />
      </div>
    </section>
  )
}
