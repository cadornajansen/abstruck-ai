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
  "Study tools, connected",
  "Bring course materials, follow source citations, keep notes and practise in the Abstruck study workspace.",
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
            Read, ask, write and practise with your materials in one place.
            These capabilities are available in the development workspace;
            public launch remains pending.
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
        <FinalCta />
      </main>
    </MarketingShell>
  )
}
