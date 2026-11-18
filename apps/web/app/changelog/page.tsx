import { PublicPage } from "@/components/public-page"
import { changelogEntries } from "@/components/marketing/content"
import { EditorialEmpty } from "@/components/marketing/editorial"
import { marketingMetadata } from "@/components/marketing/metadata"
export const metadata = marketingMetadata(
  "Changelog",
  "Reviewed public release notes for the Abstruck study workspace.",
  "/changelog"
)
export default function ChangelogPage() {
  return (
    <PublicPage
      active="changelog"
      title="Small changes. Clearer studying."
      description="Public release notes will appear here once a release has been verified."
    >
      {changelogEntries.length ? (
        <div className="flex flex-col gap-8">
          {changelogEntries.map((entry) => (
            <article
              key={`${entry.date}-${entry.title}`}
              className="border-t pt-6"
            >
              <time className="text-xs text-muted-foreground">
                {entry.date}
              </time>
              <h2 className="mt-3 text-xl font-medium">{entry.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {entry.detail}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EditorialEmpty
          title="No public releases to announce yet."
          description="Development is ongoing. Local implementation checks are not public release announcements."
        />
      )}
    </PublicPage>
  )
}
