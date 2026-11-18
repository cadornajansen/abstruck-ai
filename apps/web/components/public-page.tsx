import type { ReactNode } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { isProductionRelease } from "@/lib/release"
import { getCurrentUser } from "@/lib/auth/session"
import { MarketingShell } from "@/components/marketing/marketing-shell"

export async function PublicPage({
  title,
  description,
  active: _active,
  children,
}: {
  title: string
  description: string
  active: string
  children: ReactNode
}) {
  const user = await getCurrentUser()
  return (
    <MarketingShell authState={user ? "signed-in" : "guest"}>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 pt-14 pb-20 outline-none sm:px-8 sm:pt-20"
      >
        <div className="flex max-w-3xl flex-col items-start gap-5">
          <Badge variant="outline">
            {isProductionRelease() ? "Public beta" : "Development MVP"}
          </Badge>
          <h1 className="text-4xl leading-[1.1] font-medium tracking-tight text-balance sm:text-6xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        </div>
        {children}
      </main>
    </MarketingShell>
  )
}

export function PublicSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 border-t border-border/60 pt-7"
    >
      <h2 className="text-xl font-medium tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  )
}
