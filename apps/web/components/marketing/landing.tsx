import Link from "next/link"
import { isProductionRelease, workspaceHref } from "@/lib/release"
import {
  ArrowRight,
  ArrowDown,
  Page,
  SoundHigh,
  Notes,
  Folder,
  Check,
  Book,
  Play,
  ShareAndroid,
  ChatBubble,
  Network,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card"
import { StudyDemo } from "./study-demo"
import { MarketingFaq } from "./marketing-faq"
import { Reveal } from "./motion"

export function StartButton({
  children = "Start free",
}: {
  children?: React.ReactNode
}) {
  return (
    <Button
      size="lg"
      className="h-12 rounded-full px-7"
      render={<Link href={workspaceHref("/sign-up")} prefetch={false} />}
      nativeButton={false}
    >
      {children}
      <ArrowRight data-icon="inline-end" />
    </Button>
  )
}

function HeroObjects() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 mx-auto hidden max-w-[1440px] xl:block"
    >
      <div className="absolute top-24 left-10 flex w-40 -rotate-12 flex-col gap-4 rounded-2xl border border-border/40 bg-background p-5 shadow-composer">
        <SoundHigh className="size-5 text-info-foreground" />
        <p className="text-sm leading-5">
          How memories
          <br />
          are made
        </p>
        <div className="flex h-7 items-center gap-1">
          {["h-3", "h-5", "h-7", "h-4", "h-6", "h-3", "h-5"].map(
            (height, index) => (
              <span
                key={index}
                className={`w-1 rounded-full bg-info-border ${height}`}
              />
            )
          )}
        </div>
      </div>
      <div className="absolute top-76 left-36 w-40 rotate-6 rounded-2xl border border-info-border/40 bg-info p-5">
        <Book className="mb-3 size-5 text-info-foreground" />
        <p className="text-sm">What is retrieval?</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Bring it back to mind.
        </p>
      </div>
      <div className="absolute top-32 right-10 flex w-42 rotate-9 flex-col gap-4 rounded-2xl border border-border/40 bg-background p-5 shadow-composer">
        <Notes className="size-5 text-info-foreground" />
        <p className="text-sm">In my own words</p>
        <span className="w-fit rounded bg-info px-1 text-xs text-info-foreground">
          Make a connection.
        </span>
        <div className="flex flex-col gap-2">
          <span className="h-1 rounded bg-border" />
          <span className="h-1 rounded bg-border" />
          <span className="h-1 w-2/3 rounded bg-border" />
        </div>
      </div>
    </div>
  )
}

export function LandingContent() {
  const beta = isProductionRelease()
  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <section className="relative overflow-hidden bg-linear-to-b from-muted/35 to-background px-5 pt-16 pb-14 sm:pt-22 sm:pb-16">
        <HeroObjects />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="mb-5 text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            A little space to understand
          </p>
          <h1 className="text-[2.05rem] leading-[1.08] font-medium tracking-[-0.055em] text-balance sm:text-[clamp(2.6rem,5.2vw,4.5rem)]">
            Everything you study.
            <br />
            <span className="text-muted-foreground">One calm workspace.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-muted-foreground sm:text-lg">
            Bring your class materials together. Ask with sources, make it your
            own, and practise what you’ve learned.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <StartButton />
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-full px-6"
              render={<a href="#product-demo" />}
              nativeButton={false}
            >
              Explore the demo
              <ArrowDown data-icon="inline-end" />
            </Button>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Ongoing Free plan · Made with Philippine students in mind
          </p>
        </div>
      </section>
      <StudyDemo />
      <FeatureStory />
      <section
        id="plans"
        className="mx-auto max-w-4xl scroll-mt-28 px-5 py-16 sm:px-8 sm:py-24"
      >
        <div className="mb-10 text-center">
          <p className="mb-4 text-xs tracking-widest text-muted-foreground uppercase">
            Room for your routine
          </p>
          <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">
            Start free. Find your pace.
          </h2>
          <p className="mt-5 text-muted-foreground">
            {beta
              ? "Create a free account and start studying during the beta."
              : "The same supported tools, with different allowances."}
          </p>
        </div>
        <PlanOverview publicBeta={beta} />
        {!beta && (
          <p className="mt-5 text-center text-xs leading-6 text-muted-foreground">
            Development plans. Numeric allowances are being validated. Checkout
            remains in test mode.
          </p>
        )}
        <div className="mt-6 text-center">
          <Link
            href="/pricing"
            className="rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {beta ? "See beta pricing" : "See plans and renewal details"}
          </Link>
        </div>
      </section>
      <MarketingFaq publicBeta={beta} />
      <FinalCta />
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
                {[
                  [Page, "The active recall guide", "PDF · 6 pages"],
                  [Play, "How memories are made", "Lecture recording"],
                  [Notes, "My chapter notes", "Pasted text"],
                ].map(([Icon, title, detail]) => {
                  const MaterialIcon = Icon as typeof Page
                  return (
                    <div
                      key={String(title)}
                      className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-4"
                    >
                      <MaterialIcon className="size-5 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm">{String(title)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {String(detail)}
                        </p>
                      </div>
                    </div>
                  )
                })}
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

function PlanOverview({ publicBeta }: { publicBeta: boolean }) {
  const plans = [
    {
      name: "Free",
      price: "₱0",
      period: "ongoing",
      description: "Make room for a new study routine.",
      items: [
        "The supported study tools",
        "Smaller usage allowances",
        "Manual notes and saved-work review",
      ],
    },
    {
      name: "Paid",
      price: "₱199",
      period: "per 30 days",
      description: "More room for regular studying.",
      items: [
        "The same supported study tools",
        "Higher usage allowances",
        "Renew when you choose with QR Ph",
      ],
    },
  ]
  const availablePlans = publicBeta ? plans.slice(0, 1) : plans
  return (
    <div
      className={publicBeta ? "mx-auto max-w-sm" : "grid gap-5 sm:grid-cols-2"}
    >
      {availablePlans.map((plan) => (
        <Card
          key={plan.name}
          className="rounded-3xl py-7 [--card-spacing:--spacing(7)]"
        >
          <CardHeader>
            <CardTitle>{plan.name}</CardTitle>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              <span className="text-4xl font-medium tracking-tight">
                {plan.price}
              </span>
              <span className="ml-2 text-sm text-muted-foreground">
                {plan.period}
              </span>
            </p>
            <ul className="mt-7 flex flex-col gap-4 text-sm">
              {plan.items.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="size-4 shrink-0 text-muted-foreground" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="mt-auto border-0 bg-transparent pt-3">
            <Button
              variant={plan.name === "Free" ? "default" : "outline"}
              className="h-11 w-full rounded-full"
              render={
                <Link
                  href={
                    plan.name === "Free"
                      ? workspaceHref("/sign-up")
                      : "/pricing#renewal"
                  }
                  prefetch={false}
                />
              }
              nativeButton={false}
            >
              {plan.name === "Free" ? "Start free" : "See renewal details"}
            </Button>
          </CardFooter>
        </Card>
      ))}
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
