import { publishedArticles } from "@/lib/blog-catalog"
import { publicUrl, SEARCH_DESCRIPTION } from "@/lib/public-seo"

export function GET(): Response {
  const body = [
    "# Abstruck",
    "",
    `> ${SEARCH_DESCRIPTION}`,
    "",
    "Abstruck is a study workspace for students. Uploads are private by default. The links below lead to public product information and study guides.",
    "",
    "## Product",
    "",
    `- [Abstruck](${publicUrl("/")}): Overview and free sign-up.`,
    `- [Features](${publicUrl("/features")}): Supported materials, source citations, and practice tools.`,
    `- [Pricing](${publicUrl("/pricing")}): Current plan availability.`,
    `- [About](${publicUrl("/about")}): About Abstruck and the students it serves.`,
    "",
    "## Study and founder articles",
    "",
    ...publishedArticles.map(
      ({ title, slug, description }) =>
        `- [${title}](${publicUrl(`/blog/${slug}`)}): ${description}`
    ),
    "",
    "## Optional",
    "",
    `- [Sitemap](${publicUrl("/sitemap.xml")}): All canonical public pages.`,
    `- [Privacy](${publicUrl("/privacy")}): How Abstruck handles personal information.`,
    "",
  ].join("\n")

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
  })
}
