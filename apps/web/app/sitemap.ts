import type { MetadataRoute } from "next"
import { publishedArticles } from "@/lib/blog-catalog"
import { INDEXED_MARKETING_PATHS, publicUrl } from "@/lib/public-seo"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...Array.from(INDEXED_MARKETING_PATHS, (path) => ({
      url: publicUrl(path),
    })),
    ...publishedArticles.map(({ slug, updatedAt, publishedAt }) => ({
      url: publicUrl(`/blog/${slug}`),
      lastModified: updatedAt ?? publishedAt,
    })),
  ]
}
