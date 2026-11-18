import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

export function Brand({
  compact = false,
  href = "/",
}: {
  compact?: boolean
  href?: string
}) {
  return (
    <a
      href={href}
      aria-label="Abstruck home"
      className="inline-flex w-fit items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <Image
        src="/abstruck-logo.svg?v=3decb64dee9d"
        alt=""
        width={30}
        height={30}
        unoptimized
        className="size-[30px] shrink-0"
      />
      <span
        className={cn(
          "font-wordmark text-lg font-semibold tracking-tight",
          compact && "sr-only"
        )}
      >
        Abstruck
      </span>
    </a>
  )
}
