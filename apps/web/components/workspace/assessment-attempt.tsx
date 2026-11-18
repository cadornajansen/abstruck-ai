"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AssessmentAttempt,
  AssessmentAttemptSummary,
  AssessmentResponse,
} from "@/lib/assessment-types"

interface AnswerDraft {
  response: AssessmentResponse
  marked: boolean
  revision: number
  requestId: string
}

interface AttemptResult {
  attempt: AssessmentAttempt | null
  attempts?: AssessmentAttemptSummary[]
  stale?: boolean
}

interface AssessmentErrorBody {
  error?: string
  code?: string
  objectivePracticeAvailable?: boolean
  attempt?: AssessmentAttempt
}

class AssessmentRequestError extends Error {
  constructor(public body: AssessmentErrorBody) {
    super(
      body.error ?? "Your assessment could not be updated. Please try again."
    )
  }
}

async function assessmentRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = await response.json()
  if (!response.ok)
    throw new AssessmentRequestError(data as AssessmentErrorBody)
  return data as T
}

export function useAssessmentAttempt(
  studySetId: string,
  initialAttemptId?: string
) {
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<AssessmentAttemptSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState("")
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({})
  const [objectiveAvailable, setObjectiveAvailable] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const attemptRef = useRef<AssessmentAttempt | null>(null)
  const draftsRef = useRef<Record<string, AnswerDraft>>({})
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const restored = useRef<string | null>(null)
  const loadFailed = useRef(false)
  const startRequest = useRef<{ id: string; objectiveOnly: boolean } | null>(
    null
  )
  const submitRequest = useRef<string | null>(null)

  const keepDrafts = useCallback((next: Record<string, AnswerDraft>) => {
    draftsRef.current = next
    setDrafts(next)
    if (!attemptRef.current) return
    try {
      const key = `abstruck-assessment-draft:v1:${attemptRef.current.attemptId}`
      if (Object.keys(next).length)
        sessionStorage.setItem(key, JSON.stringify(next))
      else sessionStorage.removeItem(key)
    } catch {
      /* Server autosave still works when browser storage is unavailable. */
    }
  }, [])

  const receive = useCallback(
    (next: AssessmentAttempt | null) => {
      if (next && next.studySetId !== studySetId)
        throw new Error("This attempt belongs to a different assessment.")
      const current = attemptRef.current
      if (
        current &&
        next?.attemptId === current.attemptId &&
        Date.parse(next.serverNow) < Date.parse(current.serverNow)
      )
        return
      attemptRef.current = next
      setAttempt(next)
      if (next)
        setHistory((current) =>
          [
            {
              attemptId: next.attemptId,
              state: next.state,
              startedAt: next.startedAt,
              submittedAt: next.submittedAt,
              score: next.score,
              maxScore: next.maxScore,
            },
            ...current.filter((item) => item.attemptId !== next.attemptId),
          ]
            .sort(
              (left, right) =>
                Date.parse(right.startedAt) - Date.parse(left.startedAt)
            )
            .slice(0, 25)
        )
      if (!next || next.state !== "active") {
        keepDrafts({})
        return
      }
      if (restored.current === next.attemptId) return
      restored.current = next.attemptId
      submitRequest.current = null
      const recovered: Record<string, AnswerDraft> = {}
      try {
        const stored = JSON.parse(
          sessionStorage.getItem(
            `abstruck-assessment-draft:v1:${next.attemptId}`
          ) ?? "{}"
        ) as Record<string, AnswerDraft>
        for (const question of next.questions) {
          const draft = stored[question.id]
          const saved = next.answers.find(
            (answer) => answer.questionId === question.id
          )
          if (
            !draft ||
            saved?.final ||
            !Number.isInteger(draft.revision) ||
            draft.revision <= (saved?.revision ?? 0)
          )
            continue
          const options = question.options.map((option) => option.id)
          recovered[question.id] = {
            response: {
              ...(typeof draft.response?.text === "string"
                ? { text: draft.response.text.slice(0, 5000) }
                : {}),
              ...(Array.isArray(draft.response?.selectedOptionIds)
                ? {
                    selectedOptionIds: draft.response.selectedOptionIds.filter(
                      (id) => options.includes(id)
                    ),
                  }
                : {}),
            },
            marked: !!draft.marked,
            revision: draft.revision,
            requestId:
              typeof draft.requestId === "string"
                ? draft.requestId
                : crypto.randomUUID(),
          }
        }
      } catch {
        /* A malformed local draft must not replace the server's saved answer. */
      }
      keepDrafts(recovered)
    },
    [keepDrafts, studySetId]
  )

  const failed = useCallback(
    (cause: unknown) => {
      if (cause instanceof AssessmentRequestError) {
        if (cause.body.attempt) receive(cause.body.attempt)
        if (cause.body.code === "ai_grading_limit")
          setObjectiveAvailable(!!cause.body.objectivePracticeAvailable)
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t connect. Your answers are kept in this tab."
      )
    },
    [receive]
  )

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const id = attemptRef.current?.attemptId ?? initialAttemptId
        const result = await assessmentRequest<AttemptResult>(
          id ? `/api/attempts/${id}` : `/api/study-sets/${studySetId}/attempts`,
          { signal }
        )
        if (!signal?.aborted) {
          if (result.attempts) setHistory(result.attempts)
          receive(result.attempt)
          if (loadFailed.current) setError("")
          loadFailed.current = false
        }
      } catch (cause) {
        if (!signal?.aborted) {
          loadFailed.current = true
          failed(cause)
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [failed, initialAttemptId, receive, studySetId]
  )

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  function change(
    questionId: string,
    response: AssessmentResponse,
    marked?: boolean
  ): AnswerDraft {
    const saved = attemptRef.current?.answers.find(
      (answer) => answer.questionId === questionId
    )
    const previous = draftsRef.current[questionId]
    const draft: AnswerDraft = {
      response,
      marked: marked ?? previous?.marked ?? saved?.marked ?? false,
      revision: Math.max(previous?.revision ?? 0, saved?.revision ?? 0) + 1,
      requestId: crypto.randomUUID(),
    }
    keepDrafts({ ...draftsRef.current, [questionId]: draft })
    setError("")
    return draft
  }

  const saveQuestion = useCallback(
    (questionId: string, final = false): Promise<boolean> => {
      const task = async () => {
        const current = attemptRef.current
        if (!current || current.state !== "active") return true
        const saved = current.answers.find(
          (answer) => answer.questionId === questionId
        )
        let draft = draftsRef.current[questionId]
        if (saved?.final || (!draft && !final)) return true
        if (final) {
          draft = {
            response: draft?.response ?? saved?.response ?? {},
            marked: draft?.marked ?? saved?.marked ?? false,
            revision: Math.max(draft?.revision ?? 0, saved?.revision ?? 0) + 1,
            requestId: crypto.randomUUID(),
          }
          keepDrafts({ ...draftsRef.current, [questionId]: draft })
        }
        if (!draft) return true
        setSaving((value) => value + 1)
        try {
          const result = await assessmentRequest<AttemptResult>(
            `/api/attempts/${current.attemptId}/answers`,
            {
              method: "PUT",
              keepalive: true,
              body: JSON.stringify({ questionId, ...draft, final }),
            }
          )
          receive(result.attempt)
          if (result.stale) {
            setError(
              "This answer changed elsewhere. Your draft is kept. Edit it before trying to save again."
            )
            return false
          }
          if (draftsRef.current[questionId]?.requestId === draft.requestId) {
            const next = { ...draftsRef.current }
            delete next[questionId]
            keepDrafts(next)
          }
          setError("")
          return true
        } catch (cause) {
          failed(cause)
          return false
        } finally {
          setSaving((value) => value - 1)
        }
      }
      const result = queue.current.then(task, task)
      queue.current = result
      return result
    },
    [failed, keepDrafts, receive]
  )

  const flush = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all(
      Object.keys(draftsRef.current).map((id) => saveQuestion(id))
    )
    await queue.current
    return results.every(Boolean)
  }, [saveQuestion])

  useEffect(() => {
    if (
      !Object.keys(drafts).length ||
      error ||
      busy ||
      saving ||
      attempt?.state !== "active"
    )
      return
    const timer = setTimeout(() => {
      void flush()
    }, 600)
    return () => clearTimeout(timer)
  }, [attempt?.state, busy, drafts, error, flush, saving])

  useEffect(() => {
    if (!Object.keys(drafts).length && !saving) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [drafts, saving])

  useEffect(() => {
    if (!attempt?.deadlineAt || attempt.state !== "active") {
      setRemainingSeconds(null)
      return
    }
    const remaining =
      Date.parse(attempt.deadlineAt) - Date.parse(attempt.serverNow)
    const started = performance.now()
    const tick = () =>
      setRemainingSeconds(
        Math.max(
          0,
          Math.ceil((remaining - (performance.now() - started)) / 1000)
        )
      )
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [attempt?.deadlineAt, attempt?.serverNow, attempt?.state])

  const awaitingGrade =
    attempt?.state === "grading" ||
    attempt?.answers.some((answer) => answer.feedback?.status === "pending")
  const checkingDeadline = remainingSeconds === 0 && attempt?.state === "active"
  const polling =
    !!awaitingGrade || (attempt?.state === "active" && !!attempt.deadlineAt)
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(
      () => {
        void refresh()
      },
      awaitingGrade || checkingDeadline ? 2500 : 15000
    )
    return () => clearInterval(timer)
  }, [polling, awaitingGrade, checkingDeadline, refresh])

  async function start(objectiveOnly = false): Promise<void> {
    if (busy) return
    setBusy(true)
    setError("")
    if (
      !startRequest.current ||
      startRequest.current.objectiveOnly !== objectiveOnly
    )
      startRequest.current = { id: crypto.randomUUID(), objectiveOnly }
    try {
      const result = await assessmentRequest<AttemptResult>(
        `/api/study-sets/${studySetId}/attempts`,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: startRequest.current.id,
            objectiveOnly,
          }),
        }
      )
      receive(result.attempt)
      startRequest.current = null
      setObjectiveAvailable(false)
    } catch (cause) {
      failed(cause)
    } finally {
      setBusy(false)
    }
  }

  async function submit(): Promise<boolean> {
    if (busy || !attemptRef.current) return false
    setBusy(true)
    setError("")
    try {
      if (!(await flush())) return false
      submitRequest.current ??= crypto.randomUUID()
      const result = await assessmentRequest<AttemptResult>(
        `/api/attempts/${attemptRef.current.attemptId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ requestId: submitRequest.current }),
        }
      )
      receive(result.attempt)
      return true
    } catch (cause) {
      failed(cause)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function requestReview(questionId: string): Promise<void> {
    if (!attemptRef.current || busy) return
    setBusy(true)
    setError("")
    try {
      const result = await assessmentRequest<AttemptResult>(
        `/api/attempts/${attemptRef.current.attemptId}/report`,
        { method: "POST", body: JSON.stringify({ questionId }) }
      )
      receive(result.attempt)
    } catch (cause) {
      failed(cause)
    } finally {
      setBusy(false)
    }
  }

  async function openAttempt(attemptId: string): Promise<void> {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      if (!(await flush())) return
      const result = await assessmentRequest<AttemptResult>(
        `/api/attempts/${attemptId}`
      )
      receive(result.attempt)
    } catch (cause) {
      failed(cause)
    } finally {
      setBusy(false)
    }
  }

  return {
    attempt,
    history,
    loading,
    busy,
    saving: saving > 0,
    error,
    drafts,
    objectiveAvailable,
    remainingSeconds,
    change,
    saveQuestion,
    flush,
    refresh,
    start,
    submit,
    requestReview,
    openAttempt,
  }
}
