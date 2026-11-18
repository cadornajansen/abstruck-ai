import Link from "next/link"

import { buttonVariants } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import { Brand } from "@/components/workspace/brand"

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground">
      <Empty className="max-w-md gap-6 border-0 p-0">
        <EmptyHeader className="gap-3">
          <EmptyMedia>
            <Brand />
          </EmptyMedia>
          <p className="text-sm text-muted-foreground">404</p>
          <EmptyTitle className="text-2xl">
            <h1>Page unavailable</h1>
          </EmptyTitle>
          <EmptyDescription>
            The link may be outdated, or the page is no longer available.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/"
            prefetch={false}
            className={cn(buttonVariants(), "h-11 rounded-full px-6")}
          >
            Return home
          </Link>
          <Link
            href="/help"
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-11 rounded-full px-6"
            )}
          >
            Get help
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  )
}
