import { Badge } from "@workspace/ui/components/badge"
import { PublicPage } from "@/components/public-page"
import { roadmapItems } from "@/components/marketing/content"
import { marketingMetadata } from "@/components/marketing/metadata"
export const metadata = marketingMetadata(
  "Roadmap",
  "Current validation priorities for Abstruck. Priorities carry no release-date commitment.",
  "/roadmap"
)
export default function RoadmapPage() {
  return (
    <PublicPage
      active="roadmap"
      title="What we’re working toward."
      description="Our current focus is validating the core study flow before public launch. These priorities are not release dates or commitments to future availability."
    >
      <ol className="flex flex-col gap-2">
        {roadmapItems.map((item, index) => (
          <li
            key={item.title}
            className="grid gap-4 border-t border-border/60 py-7 sm:grid-cols-[50px_1fr_auto]"
          >
            <span className="text-sm text-muted-foreground">0{index + 1}</span>
            <div>
              <h2 className="text-xl font-medium tracking-tight">
                {item.title}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                {item.detail}
              </p>
            </div>
            <Badge className="h-fit w-fit" variant="outline">
              {item.status}
            </Badge>
          </li>
        ))}
      </ol>
    </PublicPage>
  )
}
