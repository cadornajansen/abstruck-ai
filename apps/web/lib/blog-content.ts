import "server-only"

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { BlogArticle } from "@/lib/blog-catalog"

export function readBlogMarkdown(article: BlogArticle): Promise<string> {
  return readFile(
    join(process.cwd(), "content", "blog", `${article.slug}.md`),
    "utf8"
  )
}
