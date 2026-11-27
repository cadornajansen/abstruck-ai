"use client"

import Link from "next/link"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

type Faq = {
  question: string
  answer: string
  guide?: { href: string; label: string }
}

const faqs: readonly [Faq, ...Faq[]] = [
  {
    question: "Can I use Abstruck for free?",
    answer:
      "Yes. The free plan includes uploads, study chat, flashcards, and quizzes, with limits on uploads and study activity.",
    guide: { href: "/pricing", label: "See current pricing" },
  },
  {
    question: "What can I study with Abstruck?",
    answer:
      "Upload PDFs, Word documents, PowerPoint slides, or audio and video recordings. You can also paste your notes or add a YouTube video link.",
    guide: {
      href: "/blog/source-aware-workspaces-and-document-study",
      label: "See how the workspace handles different materials",
    },
  },
  {
    question: "How do I check where an answer came from?",
    answer:
      "Open a citation beside a chat answer to jump to the page or timestamp it refers to. You can read the passage or replay that part of the recording.",
  },
  {
    question: "How do I turn my notes into flashcards?",
    answer:
      "Add your notes to a study space and generate flashcards from them. Check the cards against your notes and try answering each card before revealing it.",
    guide: {
      href: "/blog/turn-notes-into-flashcards-with-ai",
      label: "Read the flashcard guide",
    },
  },
  {
    question: "Who can see my uploads?",
    answer:
      "Your uploads are private by default. When you share a saved study set, you choose which sources to include. Anyone with the link can read what you share.",
  },
]

export function MarketingFaq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto mt-20 max-w-3xl scroll-mt-28 px-5 sm:mt-28 sm:px-8"
    >
      <h2
        id="faq-heading"
        className="text-center text-3xl font-medium tracking-tight sm:text-4xl"
      >
        Frequently asked questions
      </h2>
      <Accordion
        defaultValue={[faqs[0].question]}
        className="mt-8 motion-reduce:**:animate-none! sm:mt-12"
      >
        {faqs.map(({ question, answer, guide }) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger className="min-h-16 items-center gap-5 py-5 text-base motion-reduce:transition-none">
              {question}
            </AccordionTrigger>
            <AccordionContent
              keepMounted
              className="h-auto max-w-prose pb-5 text-base leading-7 text-muted-foreground"
            >
              <p>{answer}</p>
              {guide && <Link href={guide.href}>{guide.label}</Link>}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
