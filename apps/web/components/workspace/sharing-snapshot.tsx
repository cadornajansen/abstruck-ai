import type { SharedCitation, SharedSnapshot } from "@/lib/sharing-types"
import { StudyText } from "./study-tools-text"
import { SharingAdvancedSnapshot } from "./sharing-advanced-snapshot"

export const sharedTypeLabels: Record<SharedSnapshot["type"], string> = {
  notes: "Notes",
  summary: "Summary",
  flashcards: "Flashcards",
  quiz: "Quiz questions",
  exam: "Exam questions",
  podcast: "Podcast",
  video: "Study video",
  interactive: "Interactive practice",
  "mind-map": "Mind map",
  flowchart: "Flow chart",
  timeline: "Timeline",
  "bar-chart": "Bar chart",
  "line-chart": "Line chart",
}

function SharedCitations({ citations }: { citations: SharedCitation[] }) {
  if (!citations.length) return null
  return (
    <div className="flex flex-col gap-3 border-t pt-4" aria-label="Citations">
      {citations.map((citation, index) => (
        <blockquote
          key={`${citation.sourceKey}:${citation.page}:${index}`}
          className="border-l-2 pl-3 text-sm leading-6 text-muted-foreground"
        >
          <p className="whitespace-pre-wrap">{citation.quote}</p>
          <p className="mt-1 text-xs">Page {citation.page}</p>
        </blockquote>
      ))}
    </div>
  )
}

export function SharingSnapshot({
  snapshot,
  token,
}: {
  snapshot: SharedSnapshot
  token?: string
}) {
  return (
    <article className="flex min-w-0 flex-col gap-6 wrap-anywhere">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          {sharedTypeLabels[snapshot.type]} · Saved version {snapshot.version}
        </p>
        <h2 className="text-xl leading-7 font-medium">{snapshot.title}</h2>
      </div>
      {snapshot.output ? (
        <SharingAdvancedSnapshot
          output={snapshot.output}
          hasArtifact={!!snapshot.hasArtifact}
          token={token}
        />
      ) : ["notes", "summary"].includes(snapshot.type) ? (
        <StudyText content={snapshot.markdown || snapshot.description} />
      ) : (
        <ol className="flex flex-col gap-6">
          {snapshot.items.map((item) => (
            <li
              key={item.key}
              className="flex flex-col gap-4 rounded-[16px] border p-5"
            >
              <p className="text-xs text-muted-foreground">
                {item.kind === "flashcard" ? "Card" : "Question"}{" "}
                {item.position}
              </p>
              {item.kind === "flashcard" ? (
                <>
                  <dl className="flex flex-col gap-4 text-base leading-7">
                    <div>
                      <dt className="mb-1 text-xs text-muted-foreground">
                        Front
                      </dt>
                      <dd className="whitespace-pre-wrap">{item.front}</dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-xs text-muted-foreground">
                        Back
                      </dt>
                      <dd className="whitespace-pre-wrap">{item.back}</dd>
                    </div>
                  </dl>
                  {item.hint && (
                    <p className="text-sm leading-6">Hint: {item.hint}</p>
                  )}
                  {item.explanation && (
                    <p className="text-sm leading-6 whitespace-pre-wrap">
                      {item.explanation}
                    </p>
                  )}
                  <SharedCitations citations={item.citations} />
                </>
              ) : (
                <>
                  <p className="text-base leading-7 whitespace-pre-wrap">
                    {item.text}
                  </p>
                  {!!item.options.length && (
                    <ol className="flex list-[upper-alpha] flex-col gap-2 pl-5 text-sm leading-6">
                      {item.options.map((option) => (
                        <li key={option.id}>{option.text}</li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <SharedCitations citations={snapshot.citations} />
    </article>
  )
}
