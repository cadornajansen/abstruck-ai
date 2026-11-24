import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { LandingContent } from "@/components/marketing/landing"
import { ArticleContent } from "@/components/marketing/editorial"
import { articleDraft } from "@/components/marketing/content"

export const metadata: Metadata = {
  title: "Marketing preview · Abstruck",
  robots: { index: false, follow: false },
}

export default async function MarketingPreview({
  params,
  searchParams,
}: {
  params: Promise<{ screen?: string[] }>
  searchParams: Promise<{ auth?: string }>
}) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { screen = [] } = await params
  const { auth } = await searchParams
  if (screen.length > 1 || (screen[0] && screen[0] !== "article")) notFound()
  const signedInFixture = auth === "signed-in"
  return (
    <MarketingShell
      authState={signedInFixture ? "signed-in" : "guest"}
      homeHref="/marketing-preview"
      footerVariant={screen[0] === "article" ? "full" : "compact"}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-info-border/50 bg-info px-5 py-2 text-center text-xs leading-5 text-info-foreground">
        <span>
          Local preview · {signedInFixture ? "Signed-in" : "Guest"} navigation
          fixture · Authentication is not being tested
        </span>
        <Link
          href={
            signedInFixture
              ? "/marketing-preview"
              : "/marketing-preview?auth=signed-in"
          }
          className="rounded underline underline-offset-4"
        >
          Show {signedInFixture ? "guest" : "signed-in"} fixture
        </Link>
      </div>
      {screen[0] === "article" ? (
        <main
          id="main-content"
          className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8"
        >
          <p className="mb-6 text-sm text-info-foreground">
            Unpublished article template fixture
          </p>
          <ArticleContent article={articleDraft} />
        </main>
      ) : (
        <LandingContent />
      )}
    </MarketingShell>
  )
}
