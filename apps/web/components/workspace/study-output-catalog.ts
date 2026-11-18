import {
  CurveArray,
  GitBranch,
  GraphUp,
  Network,
  Podcast,
  Sparks,
  StatsUpSquare,
  VideoCamera,
} from "iconoir-react"
import {
  STUDY_OUTPUT_TYPES,
  type StudyOutputType,
} from "@/lib/study-output-types"

export const studyOutputTools = [
  {
    type: "podcast",
    title: "Podcast",
    icon: Podcast,
    chip: "bg-(--tool-exam-bg) text-(--tool-exam)",
    countLabel: "Episodes",
    detail: "A short narrated explanation with its saved script.",
  },
  {
    type: "video",
    title: "Video",
    icon: VideoCamera,
    chip: "bg-(--tool-exam-bg) text-(--tool-exam)",
    countLabel: "Slides",
    detail: "A short narrated slide video with its source-grounded outline.",
  },
  {
    type: "interactive",
    title: "Interactive",
    icon: Sparks,
    chip: "bg-(--tool-flashcards-bg) text-(--tool-flashcards)",
    countLabel: "Practice steps",
    detail: "Guided questions with saved hints and explanations.",
  },
  {
    type: "mind-map",
    title: "Mind Map",
    icon: Network,
    chip: "bg-(--tool-quiz-bg) text-(--tool-quiz)",
    countLabel: "Topics",
    detail: "Connected topics and their supporting source passages.",
  },
  {
    type: "flowchart",
    title: "Flow Chart",
    icon: GitBranch,
    chip: "bg-(--tool-summary-bg) text-(--tool-summary)",
    countLabel: "Steps",
    detail: "A process diagram with steps, decisions and source references.",
  },
  {
    type: "timeline",
    title: "Timeline",
    icon: CurveArray,
    chip: "bg-(--tool-notes-bg) text-(--tool-notes)",
    countLabel: "Events",
    detail: "A sequence of events or stages supported by the selected input.",
  },
  {
    type: "bar-chart",
    title: "Bar Chart",
    icon: StatsUpSquare,
    chip: "bg-(--tool-exam-bg) text-(--tool-exam)",
    countLabel: "Data points",
    detail: "A comparison using numbers actually present in the input.",
  },
  {
    type: "line-chart",
    title: "Line Chart",
    icon: GraphUp,
    chip: "bg-(--tool-quiz-bg) text-(--tool-quiz)",
    countLabel: "Data points",
    detail: "A trend using numbers actually present in the input.",
  },
] as const

export function isStudyOutputType(type: string): type is StudyOutputType {
  return STUDY_OUTPUT_TYPES.some((candidate) => candidate === type)
}

export function studyOutputTool(type: StudyOutputType) {
  return studyOutputTools.find((tool) => tool.type === type)!
}
