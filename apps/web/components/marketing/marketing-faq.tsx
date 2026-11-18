"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"

const faqs = [
  [
    "What can I bring into Abstruck?",
    "The development workspace supports PDF, DOCX, PPTX, pasted text, uploaded audio/video and individual YouTube links. Imports depend on supported formats and your available allowance.",
  ],
  [
    "Is this demo using my data?",
    "The demo uses fictional sample material and prepared answers. Notes and practice selections stay in this page until you reset or refresh. It does not upload files or call an AI model.",
  ],
  [
    "Can I start for free?",
    "Yes. Free is ongoing. Paid access is ₱199 for 30 days with the same supported tools and higher allowances. Numeric allowances are still being validated; current checkout uses test mode.",
  ],
  [
    "Can I check an answer’s source?",
    "When you study selected materials, citations link to relevant pages or timestamps. AI outputs can contain mistakes, so check the original material before relying on an answer.",
  ],
  [
    "Are my study files public?",
    "Files are private by default. You can explicitly share a saved-output snapshot and choose whether to include its sources. Anyone holding that share link can read and copy the disclosed content.",
  ],
  [
    "Does Paid renew automatically?",
    "You initiate each QR Ph payment. A verified payment grants 30 days of paid access. Early renewal adds time after the current paid expiry; there is no automatic debit.",
  ],
] as const

export function MarketingFaq({ publicBeta }: { publicBeta: boolean }) {
  const items = publicBeta
    ? [
        [
          "What can I bring into Abstruck?",
          "Import PDF, DOCX, PPTX, pasted text, or audio and video files within your allowance. You can also try a YouTube link. If it cannot be imported, upload a file you have permission to use.",
        ],
        faqs[1],
        [
          "Can I start for free?",
          "Yes. The public beta is free and includes usage allowances for uploads and study tools.",
        ],
        faqs[3],
        faqs[4],
      ]
    : faqs
  const [open, setOpen] = useState<string[]>([])
  const reduced = useReducedMotion()
  return (
    <section
      id="questions"
      className="mx-auto max-w-3xl scroll-mt-28 px-5 py-12 sm:px-8 sm:py-16"
    >
      <div className="mb-9">
        <p className="mb-4 text-xs tracking-widest text-muted-foreground uppercase">
          Before you begin
        </p>
        <h2 className="text-3xl font-medium tracking-tight sm:text-5xl">
          A few good questions.
        </h2>
      </div>
      <Accordion value={open} onValueChange={setOpen}>
        {items.map(([question, answer], index) => (
          <AccordionItem key={question} value={String(index)}>
            <AccordionTrigger className="min-h-16 gap-6 py-5 text-base">
              {question}
            </AccordionTrigger>
            <AccordionContent
              keepMounted
              render={
                <motion.div
                  className="motion-reduce:animate-none"
                  initial={false}
                  animate={{
                    height: open.includes(String(index)) ? "auto" : 0,
                    opacity: open.includes(String(index)) ? 1 : 0,
                  }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                />
              }
              className="h-auto pb-5 leading-7 text-muted-foreground"
            >
              {answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
