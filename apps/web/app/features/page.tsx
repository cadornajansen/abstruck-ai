import Link from "next/link"
import { isProductionRelease } from "@/lib/release"
import { getCurrentUser } from "@/lib/auth/session"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { StudyDemo } from "@/components/marketing/study-demo"
import {
  FeatureStory,
  FinalCta,
  StartButton,
} from "@/components/marketing/landing"
import { marketingMetadata } from "@/components/marketing/metadata"

export const metadata = marketingMetadata(
  "Study tools for PDFs, slides and lectures",
  "Study PDFs, slides and lecture recordings. Follow citations back to a page or timestamp, then practise with flashcards and quizzes.",
  "/features"
)

export default async function FeaturesPage() {
  const user = await getCurrentUser()
  return (
    <MarketingShell authState={user ? "signed-in" : "guest"}>
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section className="mx-auto max-w-3xl px-5 pt-16 pb-4 text-center sm:pt-24">
          <p className="mb-5 text-xs tracking-widest text-muted-foreground uppercase">
            The study workspace
          </p>
          <h1 className="text-4xl leading-tight font-medium tracking-tight sm:text-6xl">
            From class materials
            <br />
            <span className="text-muted-foreground">to your next review.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-lg leading-7 text-muted-foreground">
            Ask questions about your PDFs, slides or lecture recordings. Check a
            citation against the original, then practise with flashcards and
            quizzes.
            {!isProductionRelease() &&
              " These capabilities are available in the development workspace."}
          </p>
          <div className="mt-7">
            <StartButton />
          </div>
          <nav
            aria-label="Feature sections"
            className="mt-9 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground"
          >
            {[
              ["Materials", "materials"],
              ["Understanding", "understand"],
              ["Practice", "practise"],
              ["Study formats", "formats"],
            ].map(([label, id]) => (
              <a
                className="rounded underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                key={id}
                href={`#${id}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </section>
        <FeatureStory />
        <div className="py-16">
          <StudyDemo />
        </div>
        <nav
          aria-label="Study guides"
          className="mx-auto mb-12 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-3 px-5 text-sm"
        >
          <Link
            href="/blog/source-aware-workspaces-and-document-study"
            className="underline underline-offset-4"
          >
            Study with PDFs, slides and recordings
          </Link>
          <Link
            href="/blog/turn-notes-into-flashcards-with-ai"
            className="underline underline-offset-4"
          >
            Turn notes into flashcards
          </Link>
          <Link
            href="/blog/active-recall-study-method"
            className="underline underline-offset-4"
          >
            Practise active recall
          </Link>
        </nav>
        <FinalCta />
      </main>
    </MarketingShell>
  )
}
