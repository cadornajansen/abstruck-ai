export const STUDY_OUTPUT_TYPES = [
  "podcast",
  "video",
  "interactive",
  "mind-map",
  "flowchart",
  "timeline",
  "bar-chart",
  "line-chart",
] as const
export type StudyOutputType = (typeof STUDY_OUTPUT_TYPES)[number]
export type StudyInputKind = "sources" | "conversation"
export interface StudyOutputCitation {
  segment_id: string
  material_id: string
  page: number
  quote: string
}
interface OutputBase<Citation = StudyOutputCitation> {
  formatVersion: 1
  inputKind: StudyInputKind
  title: string
  description: string
  citations: Citation[]
}
export interface GraphOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "mind-map" | "flowchart"
  rootId: string
  nodes: {
    id: string
    label: string
    detail: string
    kind: "topic" | "start" | "step" | "decision" | "end"
    citations: Citation[]
  }[]
  edges: { from: string; to: string; label: string }[]
}
export interface TimelineOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "timeline"
  events: {
    id: string
    date: string
    label: string
    detail: string
    citations: Citation[]
  }[]
}
export interface ChartOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "bar-chart" | "line-chart"
  xLabel: string
  yLabel: string
  unit: string
  series: {
    name: string
    points: { label: string; value: number; citations: Citation[] }[]
  }[]
}
export interface InteractiveOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "interactive"
  steps: {
    id: string
    prompt: string
    choices: { id: string; text: string }[]
    correctChoiceId: string
    explanation: string
    hint: string
    citations: Citation[]
  }[]
}
export interface PodcastOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "podcast"
  script: { speaker: string; text: string; citations: Citation[] }[]
}
export interface VideoOutput<
  Citation = StudyOutputCitation,
> extends OutputBase<Citation> {
  kind: "video"
  slides: {
    id: string
    title: string
    bullets: string[]
    narration: string
    citations: Citation[]
  }[]
}
export type StudyOutputContent<Citation = StudyOutputCitation> =
  | GraphOutput<Citation>
  | TimelineOutput<Citation>
  | ChartOutput<Citation>
  | InteractiveOutput<Citation>
  | PodcastOutput<Citation>
  | VideoOutput<Citation>
export interface StudyOutputArtifact {
  url: string
  mime: "audio/mpeg" | "video/mp4"
  durationMs: number
  bytes: number
}
export const STUDY_OUTPUT_LIMITS: Record<
  StudyOutputType,
  { minCount: number; maxCount: number; defaultCount: number }
> = {
  "mind-map": { minCount: 3, maxCount: 16, defaultCount: 8 },
  flowchart: { minCount: 3, maxCount: 16, defaultCount: 8 },
  timeline: { minCount: 2, maxCount: 12, defaultCount: 8 },
  "bar-chart": { minCount: 2, maxCount: 12, defaultCount: 8 },
  "line-chart": { minCount: 2, maxCount: 12, defaultCount: 8 },
  interactive: { minCount: 3, maxCount: 8, defaultCount: 5 },
  podcast: { minCount: 1, maxCount: 1, defaultCount: 1 },
  video: { minCount: 3, maxCount: 5, defaultCount: 3 },
}
