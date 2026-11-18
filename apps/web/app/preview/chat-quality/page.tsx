import { ChatAnswer } from "@/components/workspace/chat-answer"
import { notFound } from "next/navigation"

const example = String.raw`## A clear explanation

Use **active recall** to retrieve an idea, then check what you missed.

- Start with a short question.
  - Explain the idea in your own words.
  - Correct one gap at a time.
- Return to it after a useful interval.

### A small comparison

| Method | What you do | Useful for |
| --- | --- | --- |
| Rereading | Look over the same notes | A first overview |
| Active recall | Answer before checking | Finding and correcting gaps |

### Mathematics

Inline: $E = mc^2$. A display equation:

$$
\frac{1}{n}\sum_{i=1}^{n}x_i = \bar{x}
$$

Common model delimiters also work: \(a^2+b^2=c^2\).

### Code you can copy

\`\`\`python
def review(card):
    answer = input(card["question"])
    return answer.strip() == card["answer"]
\`\`\`

An incomplete streaming formula stays readable: $\frac{a}{
`

export default function ChatQualityPreview() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 text-base leading-7">
      <p className="text-sm text-muted-foreground">
        Development renderer fixture · no model request or saved study data
      </p>
      <ChatAnswer text={example.replaceAll("\\`", "`")} />
    </main>
  )
}
