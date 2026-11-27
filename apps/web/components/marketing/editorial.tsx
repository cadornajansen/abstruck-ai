import Link from "next/link"
import Image from "next/image"
import { Book } from "iconoir-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import type { MarketingArticle } from "./content"
export function EditorialEmpty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Empty className="min-h-64 border bg-muted/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Book />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <Link href="/features" className="text-sm underline underline-offset-4">
        Explore the study workspace
      </Link>
    </Empty>
  )
}
export function ArticleContent({ article }: { article: MarketingArticle }) {
  return (
    <article>
      <Link
        href="/blog"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Back to the blog
      </Link>
      <p className="mt-8 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.publishedAt ? (
          <time dateTime={article.publishedAt}>{article.publishedAt}</time>
        ) : (
          <span>Draft · Not published</span>
        )}
        {article.updatedAt && (
          <span>
            Updated{" "}
            <time dateTime={article.updatedAt}>{article.updatedAt}</time>
          </span>
        )}
      </p>
      <h1 className="mt-4 text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
        {article.title}
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        {article.description}
      </p>
      {article.image && (
        <Image
          src={article.image}
          alt=""
          width={1200}
          height={760}
          sizes="(min-width: 768px) 704px, 100vw"
          className="mt-8 aspect-video w-full rounded-2xl object-cover"
        />
      )}
      <div className="mt-9 space-y-5 leading-8 text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-medium [&_h3]:mt-7 [&_h3]:text-lg [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-lg border-collapse text-left text-sm leading-6 [&_td]:border-t [&_td]:p-3 [&_th]:bg-muted [&_th]:p-3">
                  {children}
                </table>
              </div>
            ),
          }}
        >
          {article.markdown}
        </Markdown>
      </div>
      {article.publishedAt && (
        <nav
          aria-label="Continue exploring"
          className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm"
        >
          <Link href="/blog" className="underline underline-offset-4">
            More study guides
          </Link>
          <Link href="/features" className="underline underline-offset-4">
            Explore Abstruck
          </Link>
        </nav>
      )}
    </article>
  )
}
