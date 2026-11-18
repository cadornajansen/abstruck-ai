import Link from "next/link"
import { Book } from "iconoir-react"
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
      <p className="mt-8 text-xs text-muted-foreground">
        {article.publishedAt ?? "Draft · Not published"}
      </p>
      <h1 className="mt-4 text-4xl leading-tight font-medium tracking-tight sm:text-5xl">
        {article.title}
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        {article.description}
      </p>
      <div className="mt-12 flex flex-col gap-10">
        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-medium">{section.heading}</h2>
            <p className="mt-4 leading-8 text-muted-foreground">
              {section.text}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
        Product details describe the development workspace. Public launch
        remains pending.
      </p>
    </article>
  )
}
