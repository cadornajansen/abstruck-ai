import type { BlogArticle } from "@/lib/blog-catalog"
import { publicUrl, SEARCH_DESCRIPTION, SEARCH_IMAGE } from "@/lib/public-seo"

const organizationId = publicUrl("/#organization")

function StructuredData({ data }: { data: Record<string, unknown>[] }) {
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": data,
  }).replace(/</g, "\\u003c")

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}

export function WebsiteStructuredData() {
  return (
    <StructuredData
      data={[
        {
          "@type": "Organization",
          "@id": organizationId,
          name: "Abstruck",
          url: publicUrl("/"),
          logo: publicUrl("/icons/icon-512.png"),
        },
        {
          "@type": "WebSite",
          "@id": publicUrl("/#website"),
          name: "Abstruck",
          url: publicUrl("/"),
          description: SEARCH_DESCRIPTION,
          inLanguage: "en",
          publisher: { "@id": organizationId },
        },
      ]}
    />
  )
}

export function ArticleStructuredData({ article }: { article: BlogArticle }) {
  const url = publicUrl(`/blog/${article.slug}`)
  return (
    <StructuredData
      data={[
        {
          "@type": "BlogPosting",
          "@id": `${url}#article`,
          headline: article.title,
          description: article.description,
          mainEntityOfPage: url,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt ?? article.publishedAt,
          image: [publicUrl(article.image ?? SEARCH_IMAGE)],
          inLanguage: "en",
          author: {
            "@type": article.author === "Jansen" ? "Person" : "Organization",
            name: article.author,
          },
          publisher: {
            "@id": organizationId,
            "@type": "Organization",
            name: "Abstruck",
          },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: publicUrl("/"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Blog",
              item: publicUrl("/blog"),
            },
            {
              "@type": "ListItem",
              position: 3,
              name: article.title,
              item: url,
            },
          ],
        },
      ]}
    />
  )
}
