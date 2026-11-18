export const QUESTION_TYPES = [
  "multiple_choice",
  "multi_select",
  "true_false",
  "fill_blank",
  "free_response",
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

export interface AssessmentResponse {
  selectedOptionIds?: string[]
  text?: string
}

export interface AssessmentCitation {
  segment_id: string
  material_id: string
  page: number
  quote: string
}

export interface AssessmentFeedback {
  status: "correct" | "incorrect" | "review" | "pending"
  score: number | null
  maxScore: number
  text: string
  isAI: boolean
}

export interface AssessmentQuestion {
  id: string
  position: number
  type: QuestionType
  text: string
  options: { id: string; text: string }[]
}

export interface AssessmentAnswer {
  questionId: string
  response: AssessmentResponse
  revision: number
  final: boolean
  marked: boolean
  reviewRequested: boolean
  feedback: AssessmentFeedback | null
  // The server supplies these only after a quiz answer is checked or an exam is submitted.
  correctOptionIds: string[] | null
  acceptedAnswers: string[] | null
  sampleAnswer: string | null
  explanation: string | null
  citations: AssessmentCitation[]
}

export interface AssessmentAttempt {
  attemptId: string
  studySetId: string
  versionId: string
  title: string
  mode: "quiz" | "exam"
  state: "active" | "grading" | "completed"
  startedAt: string
  submittedAt: string | null
  deadlineAt: string | null
  serverNow: string
  aiGrading: boolean
  aiAttemptLimit: number
  aiAttemptsRemaining: number
  score: number | null
  maxScore: number
  reviewCount: number
  questions: AssessmentQuestion[]
  answers: AssessmentAnswer[]
}

export interface AssessmentAttemptSummary {
  attemptId: string
  state: AssessmentAttempt["state"]
  startedAt: string
  submittedAt: string | null
  score: number | null
  maxScore: number
}
