import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/session"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { ArticleContent } from "@/components/marketing/editorial"
import { marketingMetadata } from "@/components/marketing/metadata"
import { ArticleStructuredData } from "@/components/marketing/structured-data"
import { findPublishedArticle } from "@/lib/blog-catalog"
import { readBlogMarkdown } from "@/lib/blog-content"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = findPublishedArticle((await params).slug)
  if (!article) notFound()
  return marketingMetadata(
    article.seoTitle ?? article.title,
    article.description,
    `/blog/${article.slug}`,
    article
  )
}

export default async function BlogArticlePage({ params }: Props) {
  const article = findPublishedArticle((await params).slug)
  if (!article) notFound()
  const [user, markdown] = await Promise.all([
    getCurrentUser(),
    readBlogMarkdown(article),
  ])
  return (
    <MarketingShell authState={user ? "signed-in" : "guest"}>
      <ArticleStructuredData article={article} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-5 py-16 outline-none sm:px-8"
      >
        <ArticleContent article={{ ...article, markdown }} />
      </main>
    </MarketingShell>
  )
}
