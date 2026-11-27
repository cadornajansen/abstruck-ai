"use client"

import { Book, Check, Notes, Page, QuestionMark } from "iconoir-react"
import { Brand } from "@/components/workspace/brand"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"

const features = [
  {
    title: "Start with your materials",
    text: "Bring documents, text, uploaded audio or video, and individual YouTube links into one space.",
    icon: Page,
  },
  {
    title: "Understand with context",
    text: "Ask questions, follow source citations and keep your own notes alongside what you’re learning.",
    icon: Notes,
  },
  {
    title: "Put your knowledge to work",
    text: "Use flashcards, quizzes and practice exams to discover what needs another look.",
    icon: QuestionMark,
  },
  {
    title: "Return ready to review",
    text: "Keep saved study sets organised by subject and pick up your practice where you left off.",
    icon: Book,
  },
]
const faqs = [
  [
    "What is Abstruck?",
    "Abstruck is a study workspace for bringing your materials together, understanding them, practising and reviewing your progress.",
  ],
  [
    "Which materials can I study?",
    "The planned first release supports PDF, DOCX, PPTX, pasted text, uploaded audio/video and individual YouTube links. Availability is being verified during development.",
  ],
  [
    "Can I check where an answer came from?",
    "Grounded answers and study outputs link back to relevant source pages or timestamps. You should always check the cited material when something is unclear.",
  ],
  [
    "Does it include quizzes and flashcards?",
    "Yes. The approved MVP includes saved flashcards, fast and spaced review, quizzes and practice exams.",
  ],
  [
    "Is there a Free plan?",
    "Yes. Free is ongoing. Pro costs US$6.99 or ₱199 monthly and includes higher study allowances.",
  ],
]

export function LandingPreview() {
  return (
    <div className="bg-background text-foreground">
      <header className="border-b border-border/40">
        <nav
          aria-label="Public navigation"
          className="mx-auto flex h-18 max-w-7xl items-center gap-7 px-6"
        >
          <Brand href="/preview/landing" />
          <a
            href="#features"
            className="hidden text-sm text-muted-foreground sm:block"
          >
            Features
          </a>
          <a
            href="#plans"
            className="hidden text-sm text-muted-foreground sm:block"
          >
            Plans
          </a>
          <a
            href="#questions"
            className="hidden text-sm text-muted-foreground md:block"
          >
            Questions
          </a>
          <Button
            render={<a href="/preview/onboarding" />}
            nativeButton={false}
            className="ml-auto rounded-full px-5"
          >
            Get started
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto flex min-h-[650px] max-w-4xl flex-col items-center px-6 pt-20 text-center sm:pt-20">
          <Badge
            variant="outline"
            className="h-8 px-3 font-normal text-muted-foreground"
          >
            Made for your study routine
          </Badge>
          <h1 className="mt-6 text-4xl leading-tight font-medium tracking-tight sm:text-[56px] sm:leading-[1.2]">
            Your study workspace
          </h1>
          <p className="mt-8 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Bring your materials. Understand the ideas. Practise with purpose.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button
              variant="outline"
              render={<a href="#features" />}
              nativeButton={false}
              className="h-12 rounded-full px-6 text-base font-normal"
            >
              See features
            </Button>
            <Button
              render={<a href="/preview/onboarding" />}
              nativeButton={false}
              className="h-12 rounded-full px-6 text-base font-normal"
            >
              Start studying
            </Button>
          </div>
          <p className="mt-7 text-sm text-muted-foreground">
            Built for students in the Philippines
          </p>
        </section>
        <section
          id="features"
          className="mx-auto max-w-6xl scroll-mt-8 px-6 py-16"
        >
          <h2 className="text-center text-3xl font-medium tracking-tight sm:text-5xl">
            A clear place to study.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-center leading-7 text-muted-foreground">
            From the first source to the next review session, keep your learning
            connected.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {features.map(({ title, text, icon: Icon }) => (
              <Card key={title} className="rounded-3xl py-7">
                <CardHeader>
                  <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-muted">
                    <Icon className="size-6" />
                  </span>
                  <CardTitle className="text-xl font-medium">{title}</CardTitle>
                  <CardDescription className="mt-2 leading-7">
                    {text}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Button
              variant="outline"
              render={<a href="/preview/workspace" />}
              nativeButton={false}
              className="rounded-full"
            >
              Explore the sample workspace
            </Button>
          </div>
        </section>
        <section
          id="plans"
          className="mx-auto max-w-4xl scroll-mt-8 px-6 py-16"
        >
          <h2 className="text-center text-3xl font-medium">
            Choose your study pace
          </h2>
          <p className="mt-4 text-center leading-7 text-muted-foreground">
            The same study tools. Different allowances.
          </p>
          <div className="mt-9 grid gap-5 sm:grid-cols-2">
            {[
              {
                name: "Free",
                price: "₱0",
                period: "ongoing",
                detail: "Start building your study routine.",
                items: [
                  "Spaces and your material library",
                  "Chat, notes and saved study sets",
                  "Flashcards, quizzes and exams",
                ],
              },
              {
                name: "Pro",
                price: "US$6.99",
                period: "or ₱199 per month",
                detail: "More room for regular study.",
                items: [
                  "All the same study tools",
                  "Higher import and generation allowances",
                  "Manage your monthly subscription with Polar",
                ],
              },
            ].map((plan) => (
              <Card key={plan.name} className="rounded-3xl py-7">
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="mt-2">
                    {plan.detail}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p>
                    <strong className="text-4xl font-medium">
                      {plan.price}
                    </strong>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </p>
                  <ul className="mt-7 flex flex-col gap-4 text-sm">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-3">
                        <Check className="size-4 shrink-0 text-plan-foreground" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-8 w-full rounded-full"
                    render={<a href="/preview/onboarding" />}
                    nativeButton={false}
                  >
                    Explore the preview
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-5 text-center text-xs leading-6 text-muted-foreground">
            Explore plans in this preview. To subscribe, open Plan &amp; Billing
            in your workspace.
          </p>
        </section>
        <section
          id="questions"
          className="mx-auto max-w-3xl scroll-mt-8 px-6 py-16"
        >
          <h2 className="mb-8 text-center text-3xl font-medium">
            Questions, answered
          </h2>
          <Accordion>
            {faqs.map(([question, answer], index) => (
              <AccordionItem key={question} value={`faq-${index}`}>
                <AccordionTrigger className="py-6 text-base font-normal">
                  {question}
                </AccordionTrigger>
                <AccordionContent className="pb-6 leading-7 text-muted-foreground">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
        <section className="px-6 py-24 text-center">
          <h2 className="text-3xl font-medium sm:text-5xl">
            Make room for better study.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Your materials and your next step, together.
          </p>
          <Button
            render={<a href="/preview/onboarding" />}
            nativeButton={false}
            className="mt-8 h-12 rounded-full px-7 text-base"
          >
            Get started
          </Button>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-10">
          <Brand href="/preview/landing" />
          <p className="text-xs text-muted-foreground">
            Abstruck · A study workspace
          </p>
          <a href="/preview" className="text-sm underline underline-offset-4">
            Back to screen preview
          </a>
        </div>
      </footer>
    </div>
  )
}
