import type { Metadata } from "next"
import type { BlogArticle } from "@/lib/blog-catalog"
import {
  INDEXED_MARKETING_PATHS,
  publicUrl,
  SEARCH_IMAGE,
} from "@/lib/public-seo"
import { isProductionRelease } from "@/lib/release"

export function marketingMetadata(
  title: string,
  description: string,
  path: string,
  article?: BlogArticle
): Metadata {
  const url = publicUrl(path)
  const index =
    isProductionRelease() &&
    (INDEXED_MARKETING_PATHS.has(path) || Boolean(article))
  const image = publicUrl(article?.image ?? SEARCH_IMAGE)
  return {
    title: path === "/" ? title : `${title} · Abstruck`,
    description,
    alternates: {
      canonical: url,
      ...(article ? { types: { "text/markdown": `${url}.md` } } : {}),
    },
    robots: index
      ? { index: true, follow: true, "max-image-preview": "large" }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      siteName: "Abstruck",
      images: [
        { url: image, alt: article?.title ?? "The Abstruck study workspace" },
      ],
      ...(article
        ? {
            type: "article",
            publishedTime: article.publishedAt,
            modifiedTime: article.updatedAt,
            authors: [article.author],
          }
        : { type: "website" }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}
