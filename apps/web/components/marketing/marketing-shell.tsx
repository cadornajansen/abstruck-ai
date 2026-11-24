import type { ReactNode } from "react"
import Link from "next/link"
import { workspaceHref } from "@/lib/release"
import { Brand } from "@/components/workspace/brand"
import { Separator } from "@workspace/ui/components/separator"
import {
  MarketingNavigation,
  type MarketingAuthState,
} from "./marketing-navigation"

const projectLinks = [
  ["Changelog", "/changelog"],
  ["Roadmap", "/roadmap"],
] as const

const utilityLinks = [
  ["Help & contact", "/contact"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
] as const

const footerLinkClassName =
  "rounded text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"

function CompactFooter({ homeHref }: { homeHref: string }) {
  return (
    <footer className="mt-auto">
      <Separator />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Brand href={homeHref} />
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Abstruck
          </span>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-5 gap-y-3"
        >
          {[...projectLinks, ...utilityLinks].map(([label, href]) => (
            <Link key={href} href={href} className={footerLinkClassName}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}

function FullFooter({ homeHref }: { homeHref: string }) {
  const groups = [
    [
      "Study",
      [
        ["Features", "/features"],
        ["Pricing", "/pricing"],
        ["Start free", workspaceHref("/sign-up")],
      ],
    ],
    ["Abstruck", [["About", "/about"], ["Blog", "/blog"], ...projectLinks]],
    ["The details", utilityLinks],
  ] as const

  return (
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
        {groups.map(([group, items]) => (
          <nav
            key={group}
            aria-label={`${group} links`}
            className="flex flex-col items-start gap-3"
          >
            <h2 className="mb-1 text-sm font-medium">{group}</h2>
            {items.map(([label, href]) => (
              <Link key={href} href={href} className={footerLinkClassName}>
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
  )
}

export function MarketingShell({
  children,
  authState,
  homeHref = "/",
  footerVariant = "full",
}: {
  children: ReactNode
  authState: MarketingAuthState
  homeHref?: string
  footerVariant?: "full" | "compact"
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground/90 selection:bg-info-border/50">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-background px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <MarketingNavigation
        authState={authState}
        homeHref={homeHref}
        workspaceRoot={workspaceHref("/")}
      />
      {children}
      {footerVariant === "compact" ? (
        <CompactFooter homeHref={homeHref} />
      ) : (
        <FullFooter homeHref={homeHref} />
      )}
    </div>
  )
}
