import { findPublishedArticle } from "@/lib/blog-catalog"
import { readBlogMarkdown } from "@/lib/blog-content"
import { publicUrl } from "@/lib/public-seo"
import { MARKETING_HOSTNAME, isProductionRelease } from "@/lib/release"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const hostname = request.headers.get("host") ?? new URL(request.url).hostname
  const { slug } = await params
  const article = findPublishedArticle(slug)
  if (!article || (isProductionRelease() && hostname !== MARKETING_HOSTNAME)) {
    return new Response(null, { status: 404 })
  }

  const canonical = publicUrl(`/blog/${article.slug}`)
  const body = await readBlogMarkdown(article)
  return new Response(
    `# ${article.title}\n\n${article.description}\n\nBy ${article.author} · ${article.publishedAt}\n\n${body}`,
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "text/markdown; charset=utf-8",
        Link: `<${canonical}>; rel="canonical"`,
        "X-Robots-Tag": "noindex",
      },
    }
  )
}
