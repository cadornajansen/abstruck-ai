"use client"

import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { Check, Copy } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from "@workspace/ui/components/code-block"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useHighlightedCode } from "@/hooks/use-highlighted-code"

function AnswerCode({ value, language }: { value: string; language: string }) {
  const lines = useHighlightedCode(value, language)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <CodeBlock className="my-1 rounded-xl bg-muted/25">
      <CodeBlockHeader>
        <CodeBlockTitle>{language || "Code"}</CodeBlockTitle>
        <CodeBlockActions>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 font-normal"
            aria-label={copied ? "Code copied" : "Copy code"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value)
                setCopied(true)
                setCopyError(false)
              } catch {
                setCopyError(true)
              }
            }}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent>
        {lines.map((line, index) => (
          <CodeBlockLine key={index}>{line}</CodeBlockLine>
        ))}
      </CodeBlockContent>
      {copyError && (
        <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">
          Select the code and copy it manually.
        </p>
      )}
    </CodeBlock>
  )
}

function MarkdownCode({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children).find((item) => isValidElement(item))
  if (!isValidElement<{ children?: ReactNode; className?: string }>(child))
    return (
      <pre className="max-w-full overflow-x-auto rounded-xl bg-muted p-4">
        {children}
      </pre>
    )
  const value =
    typeof child.props.children === "string"
      ? child.props.children.replace(/\n$/, "")
      : ""
  const language =
    /language-([^\s]+)/.exec(child.props.className ?? "")?.[1] ?? ""
  return <AnswerCode value={value} language={language} />
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-border underline-offset-4 hover:decoration-current"
    >
      {children}
    </a>
  ),
  pre: MarkdownCode,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
  ),
  hr: () => <Separator className="my-2" />,
  table: ({ children }) => (
    <Table aria-label="Answer table" className="my-1 min-w-max">
      {children}
    </Table>
  ),
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children }) => (
    <TableHead className="bg-muted/40">{children}</TableHead>
  ),
  td: ({ children }) => (
    <TableCell className="max-w-80 whitespace-normal">{children}</TableCell>
  ),
}

// Accept common model math delimiters without rewriting fenced or inline code.
function mathDelimiters(text: string): string {
  return text.replace(
    /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*(?:`|$))|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (
      match,
      code: string | undefined,
      inline: string | undefined,
      block: string | undefined
    ) =>
      code ??
      (inline !== undefined
        ? `$${inline}$`
        : block !== undefined
          ? `\n\n$$\n${block}\n$$\n\n`
          : match)
  )
}

export function ChatAnswer({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 whitespace-normal [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h1]:mt-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-1 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:pl-1 [&_li+li]:mt-2 [&_li>p+p]:mt-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:leading-7 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { strict: false, trust: false, throwOnError: false }],
        ]}
        skipHtml
        disallowedElements={["img"]}
        components={markdownComponents}
      >
        {mathDelimiters(text)}
      </Markdown>
    </div>
  )
}
