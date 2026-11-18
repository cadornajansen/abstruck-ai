import type { ReactNode } from "react"
import Link from "next/link"
import { Brand } from "@/components/workspace/brand"
import { Separator } from "@workspace/ui/components/separator"
import {
  MarketingNavigation,
  type MarketingAuthState,
} from "./marketing-navigation"

export function MarketingShell({
  children,
  authState,
  homeHref = "/",
}: {
  children: ReactNode
  authState: MarketingAuthState
  homeHref?: string
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground/90 selection:bg-info-border/50">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <MarketingNavigation authState={authState} homeHref={homeHref} />
      {children}
      <footer className="mt-auto bg-muted/30">
        <Separator />
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <Brand href={homeHref} />
            <p className="max-w-60 text-sm leading-6 text-muted-foreground">
              A calm place for your materials, your questions and your next
              review.
            </p>
          </div>
          {[
            [
              "Study",
              [
                ["Features", "/features"],
                ["Pricing", "/pricing"],
                ["Start free", "/sign-up"],
              ],
            ],
            [
              "Abstruck",
              [
                ["About", "/about"],
                ["Blog", "/blog"],
                ["Changelog", "/changelog"],
                ["Roadmap", "/roadmap"],
              ],
            ],
            [
              "The details",
              [
                ["Help & contact", "/contact"],
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
              ],
            ],
          ].map(([group, items]) => (
            <nav
              key={group as string}
              aria-label={`${group} links`}
              className="flex flex-col items-start gap-3"
            >
              <h2 className="mb-1 text-sm font-medium">{group as string}</h2>
              {(items as string[][]).map(([label, href]) => (
                <Link
                  key={href}
                  href={href!}
                  className="rounded text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 pb-7 text-xs text-muted-foreground sm:px-8">
          <span>© {new Date().getFullYear()} Abstruck</span>
          <span>Bring materials. Understand. Practise. Review.</span>
        </div>
      </footer>
    </div>
  )
}
