import Link from "next/link"
import { PublicPage } from "@/components/public-page"
import { publishedArticles } from "@/components/marketing/content"
import { EditorialEmpty } from "@/components/marketing/editorial"
import { marketingMetadata } from "@/components/marketing/metadata"
export const metadata = marketingMetadata(
  "Blog",
  "Study guides and product notes from Abstruck. Reviewed articles will appear here when published.",
  "/blog"
)
export default function BlogPage() {
  return (
    <PublicPage
      active="blog"
      title="Notes on studying."
      description="Practical guides and product notes will live here as they are reviewed and published."
    >
      {publishedArticles.length ? (
        <div className="flex flex-col gap-6">
          {publishedArticles.map((article) => (
            <article key={article.slug} className="border-t py-6">
              <p className="text-xs text-muted-foreground">
                {article.publishedAt}
              </p>
              <h2 className="mt-3 text-2xl">
                <Link
                  href={`/blog/${article.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {article.title}
                </Link>
              </h2>
              <p className="mt-3 text-muted-foreground">
                {article.description}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EditorialEmpty
          title="Our first notes are still in the making."
          description="There are no published articles yet. Check back for reviewed study guides and Abstruck updates."
        />
      )}
    </PublicPage>
  )
}
