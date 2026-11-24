"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

const faqs = [
  {
    question: "Can I use Abstruck for free?",
    answer:
      "Yes. The free plan includes uploads, study chat, flashcards, and quizzes, with limits on uploads and study activity.",
  },
  {
    question: "What can I study with Abstruck?",
    answer:
      "Upload PDFs, Word documents, PowerPoint slides, or audio and video recordings. You can also paste your notes or add a YouTube video link.",
  },
  {
    question: "How do I check where an answer came from?",
    answer:
      "Open a citation beside a chat answer to jump to the page or timestamp it refers to. You can read the passage or replay that part of the recording.",
  },
  {
    question: "Who can see my uploads?",
    answer:
      "Your uploads are private by default. When you share a saved study set, you choose which sources to include. Anyone with the link can read what you share.",
  },
] as const

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
        {faqs.map(({ question, answer }) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger className="min-h-16 items-center gap-5 py-5 text-base motion-reduce:transition-none">
              {question}
            </AccordionTrigger>
            <AccordionContent className="h-auto max-w-prose pb-5 text-base leading-7 text-muted-foreground">
              {answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
