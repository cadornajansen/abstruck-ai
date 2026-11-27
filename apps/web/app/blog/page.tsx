import Link from "next/link"
import { PublicPage } from "@/components/public-page"
import { marketingMetadata } from "@/components/marketing/metadata"
import { publishedArticles } from "@/lib/blog-catalog"

const description =
  "Study guides on active recall, lecture transcription, flashcards, and learning with your course materials, plus notes from Abstruck’s founder."

export const metadata = marketingMetadata(
  "Study guides and founder notes",
  description,
  "/blog"
)

export default function BlogPage() {
  return (
    <PublicPage
      active="blog"
      title="Study guides and founder notes"
      description={description}
    >
      <div className="flex flex-col gap-6">
        {publishedArticles.map((article) => (
          <article key={article.slug} className="border-t py-6">
            <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{article.author}</span>
              <time dateTime={article.publishedAt}>{article.publishedAt}</time>
            </p>
            <h2 className="mt-3 text-2xl tracking-tight">
              <Link
                href={`/blog/${article.slug}`}
                className="underline-offset-4 hover:underline"
              >
                {article.title}
              </Link>
            </h2>
            <p className="mt-3 max-w-prose leading-7 text-muted-foreground">
              {article.description}
            </p>
          </article>
        ))}
      </div>
    </PublicPage>
  )
}
