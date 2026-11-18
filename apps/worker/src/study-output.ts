export const OUTPUT_TYPES = [
  "podcast",
  "video",
  "interactive",
  "mind-map",
  "flowchart",
  "timeline",
  "bar-chart",
  "line-chart",
] as const
export type OutputType = (typeof OUTPUT_TYPES)[number]
export interface OutputCitation {
  segment_id: string
  material_id: string
  page: number
  quote: string
}
export function verifyOutputCitations(
  value: unknown,
  pages: { id: string; material_id: string; ordinal: number; text: string }[]
): OutputCitation[] {
  if (
    !Array.isArray(value) ||
    value.length > 5 ||
    (pages.length && !value.length)
  )
    throw new OutputError("citation_validation_failed")
  return value.map((entry: unknown) => {
    if (
      !object(entry) ||
      typeof entry.segment_id !== "string" ||
      typeof entry.quote !== "string" ||
      !entry.quote ||
      entry.quote.length > 600
    )
      throw new OutputError("citation_validation_failed")
    const page = pages.find((page) => page.id === entry.segment_id)
    if (!page || !page.text.includes(entry.quote))
      throw new OutputError("citation_validation_failed")
    return {
      segment_id: page.id,
      material_id: page.material_id,
      page: page.ordinal,
      quote: entry.quote,
    }
  })
}
export class OutputError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
type Value = Record<string, unknown>
const object = (value: unknown): value is Value =>
  !!value && typeof value === "object" && !Array.isArray(value)
function fail(): never {
  throw new OutputError("invalid_study_output")
}
function record(value: unknown): Value {
  return object(value) ? value : fail()
}
function label(value: unknown, maximum = 500, empty = false): string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    (!empty && !value.trim())
  )
    return fail()
  return value
}
function list(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum)
    return fail()
  return value
}
function id(value: unknown): string {
  const result = label(value, 40)
  return /^[A-Za-z0-9_-]+$/.test(result) ? result : fail()
}
function unique(ids: string[]): void {
  if (new Set(ids).size !== ids.length) fail()
}
const string = (maximum: number) => ({ type: "string", maxLength: maximum })
const array = (items: unknown, maximum: number) => ({
  type: "array",
  maxItems: maximum,
  items,
})
const schemaObject = (properties: Value) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})

export function outputSchema(
  type: OutputType,
  citationSchema: Value,
  count: number
): Value {
  const cited = { citations: citationSchema }
  const common = {
    status: { type: "string", enum: ["ready", "data_missing"] },
    title: string(140),
    description: string(600),
    ...cited,
  }
  if (type === "mind-map" || type === "flowchart")
    return schemaObject({
      ...common,
      rootId: string(40),
      nodes: array(
        schemaObject({
          id: string(40),
          label: string(140),
          detail: string(500),
          kind: {
            type: "string",
            enum: ["topic", "start", "step", "decision", "end"],
          },
          ...cited,
        }),
        count
      ),
      edges: array(
        schemaObject({ from: string(40), to: string(40), label: string(100) }),
        24
      ),
    })
  if (type === "timeline")
    return schemaObject({
      ...common,
      events: array(
        schemaObject({
          id: string(40),
          date: string(80),
          label: string(140),
          detail: string(500),
          ...cited,
        }),
        count
      ),
    })
  if (type === "bar-chart" || type === "line-chart")
    return schemaObject({
      ...common,
      xLabel: string(120),
      yLabel: string(120),
      unit: string(80),
      series: array(
        schemaObject({
          name: string(100),
          points: array(
            schemaObject({
              label: string(120),
              value: { type: "number" },
              ...cited,
            }),
            count
          ),
        }),
        3
      ),
    })
  if (type === "interactive")
    return schemaObject({
      ...common,
      steps: array(
        schemaObject({
          id: string(40),
          prompt: string(500),
          choices: array(
            schemaObject({ id: string(40), text: string(300) }),
            4
          ),
          correctChoiceId: string(40),
          explanation: string(700),
          hint: string(300),
          ...cited,
        }),
        count
      ),
    })
  if (type === "podcast")
    return schemaObject({
      ...common,
      script: array(
        schemaObject({ speaker: string(40), text: string(600), ...cited }),
        6
      ),
    })
  return schemaObject({
    ...common,
    slides: array(
      schemaObject({
        id: string(40),
        title: string(140),
        bullets: array(string(180), 4),
        narration: string(300),
        ...cited,
      }),
      count
    ),
  })
}

const normalized = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, " ").trim()
function numbers(value: string): number[] {
  return (value.match(/-?\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).map((number) =>
    Number(number.replaceAll(",", ""))
  )
}
export function hasChartData(evidence: string): boolean {
  return numbers(evidence).length >= 2
}
function numericEvidence(
  value: number,
  name: string,
  evidence: string
): boolean {
  return evidence.split(/\n+/).some((row) => {
    // Semicolons separate cells; the row's shared date still applies to each cell.
    const sourceRow = normalized(row)
    const pointLabel = normalized(name)
    return (
      sourceRow.includes(pointLabel) &&
      numbers(sourceRow.replace(pointLabel, "")).some(
        (number) => number === value
      )
    )
  })
}

export function validateOutput(
  raw: unknown,
  type: OutputType,
  count: number,
  context: {
    inputKind: "sources" | "conversation"
    evidence: string
    citations: (value: unknown) => OutputCitation[]
  }
): Value {
  const data = record(raw)
  if (data.status === "data_missing")
    throw new OutputError("provider_data_missing")
  if (data.status !== "ready") fail()
  const cited = (entry: Value) => ({
    citations: context.citations(entry.citations),
  })
  const common = {
    formatVersion: 1,
    kind: type,
    inputKind: context.inputKind,
    title: label(data.title, 140),
    description: label(data.description, 600, true),
    ...cited(data),
  }
  if (type === "mind-map" || type === "flowchart") {
    const nodes = list(data.nodes, 3, Math.min(count, 16)).map((rawNode) => {
      const node = record(rawNode)
      if (
        !["topic", "start", "step", "decision", "end"].includes(
          String(node.kind)
        )
      )
        fail()
      return {
        id: id(node.id),
        label: label(node.label, 140),
        detail: label(node.detail, 500, true),
        kind: node.kind,
        ...cited(node),
      }
    })
    unique(nodes.map((node) => node.id))
    const rootId = id(data.rootId)
    if (!nodes.some((node) => node.id === rootId)) fail()
    const edges = list(data.edges, nodes.length - 1, 24).map((rawEdge) => {
      const edge = record(rawEdge)
      const from = id(edge.from),
        to = id(edge.to)
      if (
        from === to ||
        !nodes.some((node) => node.id === from) ||
        !nodes.some((node) => node.id === to)
      )
        fail()
      return { from, to, label: label(edge.label, 100, true) }
    })
    unique(edges.map((edge) => `${edge.from}:${edge.to}`))
    const reachable = new Set([rootId])
    for (let round = 0; round < nodes.length; round++)
      for (const edge of edges)
        if (reachable.has(edge.from)) reachable.add(edge.to)
    if (reachable.size !== nodes.length) fail()
    if (
      type === "mind-map" &&
      (edges.length !== nodes.length - 1 ||
        nodes.some(
          (node) =>
            edges.filter((edge) => edge.to === node.id).length !==
            (node.id === rootId ? 0 : 1)
        ))
    )
      fail()
    return { ...common, rootId, nodes, edges }
  }
  if (type === "timeline") {
    const events = list(data.events, 2, Math.min(count, 12)).map((rawEvent) => {
      const event = record(rawEvent)
      const date = label(event.date, 80)
      const citations = context.citations(event.citations)
      const evidence =
        context.inputKind === "sources"
          ? citations.map((citation) => citation.quote).join("\n")
          : context.evidence
      if (!normalized(evidence).includes(normalized(date)))
        throw new OutputError("timeline_evidence_mismatch")
      return {
        id: id(event.id),
        date,
        label: label(event.label, 140),
        detail: label(event.detail, 500),
        citations,
      }
    })
    unique(events.map((event) => event.id))
    return { ...common, events }
  }
  if (type === "bar-chart" || type === "line-chart") {
    const series = list(data.series, 1, 3).map((rawSeries) => {
      const entry = record(rawSeries)
      const points = list(entry.points, 2, Math.min(count, 12)).map(
        (rawPoint) => {
          const point = record(rawPoint)
          const name = label(point.label, 120)
          if (
            typeof point.value !== "number" ||
            !Number.isFinite(point.value) ||
            Math.abs(point.value) > 1e12
          )
            fail()
          const citations = context.citations(point.citations)
          const evidence =
            context.inputKind === "sources"
              ? citations.map((citation) => citation.quote).join("\n")
              : context.evidence
          if (!numericEvidence(point.value, name, evidence))
            throw new OutputError("chart_evidence_mismatch")
          return { label: name, value: point.value, citations }
        }
      )
      unique(points.map((point) => point.label))
      return { name: label(entry.name, 100), points }
    })
    unique(series.map((entry) => entry.name))
    if (
      series.some(
        (entry) =>
          JSON.stringify(entry.points.map((point) => point.label)) !==
          JSON.stringify(series[0]!.points.map((point) => point.label))
      )
    )
      fail()
    return {
      ...common,
      xLabel: label(data.xLabel, 120),
      yLabel: label(data.yLabel, 120),
      unit: label(data.unit, 80, true),
      series,
    }
  }
  if (type === "interactive") {
    const steps = list(data.steps, 3, Math.min(count, 8)).map((rawStep) => {
      const step = record(rawStep)
      const choices = list(step.choices, 2, 4).map((rawChoice) => {
        const choice = record(rawChoice)
        return { id: id(choice.id), text: label(choice.text, 300) }
      })
      unique(choices.map((choice) => choice.id))
      const correctChoiceId = id(step.correctChoiceId)
      if (!choices.some((choice) => choice.id === correctChoiceId)) fail()
      return {
        id: id(step.id),
        prompt: label(step.prompt, 500),
        choices,
        correctChoiceId,
        explanation: label(step.explanation, 700),
        hint: label(step.hint, 300, true),
        ...cited(step),
      }
    })
    unique(steps.map((step) => step.id))
    return { ...common, steps }
  }
  if (type === "podcast") {
    const script = list(data.script, 1, 6).map((rawLine) => {
      const line = record(rawLine)
      return {
        speaker: label(line.speaker, 40),
        text: label(line.text, 600),
        ...cited(line),
      }
    })
    if (script.map((line) => line.text).join("\n").length > 600) fail()
    return { ...common, script }
  }
  const slides = list(data.slides, 3, Math.min(count, 5)).map((rawSlide) => {
    const slide = record(rawSlide)
    return {
      id: id(slide.id),
      title: label(slide.title, 140),
      bullets: list(slide.bullets, 1, 4).map((bullet) => label(bullet, 180)),
      narration: label(slide.narration, 300),
      ...cited(slide),
    }
  })
  unique(slides.map((slide) => slide.id))
  if (slides.map((slide) => slide.narration).join("\n").length > 600) fail()
  return { ...common, slides }
}

export const OUTPUT_INSTRUCTIONS =
  "Return semantic study content only, never executable HTML, JavaScript, SVG markup or Mermaid code. For graphs use short stable IDs, connected nodes from rootId; a mind-map must be a rooted tree. Use the specified node kinds. Interactive steps are recall exercises with 2–4 distinct choices and one correctChoiceId. A timeline requires explicit source/conversation date or day labels: copy date labels verbatim. Bar/line chart numbers must be copied, never invented or inferred; point labels must be verbatim input labels, and each source citation quote must contain both its point label and numeric value. Copy the entire original data line for chart citations, including all columns and punctuation. When several series share one line, reuse that exact complete line for each point; never remove intervening words or splice its date label onto a later column. A date/day number in a point label is not a measured value. For conversation charts use numeric rows supplied by USER messages only. Keep the same point labels/order across series. If required dates/numeric data are missing, set status data_missing with empty arrays/strings rather than guessing. Podcast and video narration combined must be <=600 characters, suitable for a short single-voice study explanation. Video has 3–5 slides with concise bullets and narration. Cite supporting exact source substrings for every node, event, point, step, script part and slide; in conversation mode ALL citations arrays must be empty."
