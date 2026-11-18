import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/session"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { publishedArticles } from "@/components/marketing/content"
import { ArticleContent } from "@/components/marketing/editorial"
import { marketingMetadata } from "@/components/marketing/metadata"
type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const article = publishedArticles.find(
    (item) => item.slug === slug && item.publishedAt
  )
  if (!article) notFound()
  return marketingMetadata(
    article.title,
    article.description,
    `/blog/${article.slug}`
  )
}
export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params
  const article = publishedArticles.find(
    (item) => item.slug === slug && item.publishedAt
  )
  if (!article) notFound()
  const user = await getCurrentUser()
  return (
    <MarketingShell authState={user ? "signed-in" : "guest"}>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-5 py-16 outline-none sm:px-8"
      >
        <ArticleContent article={article} />
      </main>
    </MarketingShell>
  )
}
