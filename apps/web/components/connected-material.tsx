"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { UploadOptions } from "@/lib/file-upload"
import { Book } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { AssessmentPage } from "@/components/workspace/assessment-page"
import {
  MaterialWorkspace,
  type MaterialPage,
  type StudyMessage,
} from "@/components/workspace/material-workspace"
import {
  WorkspaceShell,
  type StudySpace,
  type RecentMaterial,
} from "@/components/workspace/study-home"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import type { Tables } from "@/lib/supabase/database.types"
import {
  MaterialDialog,
  type MaterialInputKind,
  type MaterialDraft,
} from "@/components/workspace/material-dialog"
import type { CreateSpaceAction } from "@/components/workspace/create-space-dialog"
import { useCreateSpace } from "@/hooks/use-create-space"
import {
  importPastedText,
  importYouTube,
  uploadMaterial,
} from "@/lib/upload-material"
import type {
  ChatSourceOption,
  ConversationSummary,
} from "@/components/workspace/chat-controls"
import type { MaterialMedia } from "@/components/workspace/media-source-view"
import type { ReadingPosition } from "@/lib/library"
import {
  DEFAULT_CHAT_PREFERENCES,
  type ChatPreferences,
  type ChatModelOption,
} from "@/lib/chat-preferences"

interface ChatSnapshot {
  messages: StudyMessage[]
  conversations: ConversationSummary[]
  conversationId: string | null
  sourceIds: string[]
  preferences?: ChatPreferences
  availableModels?: ChatModelOption[]
  webSearchAvailable?: boolean
  maxAnswerCostUsd?: number
  pendingPrompt?: {
    question: string
    requestId: string
    conversationId: string
    sourceIds: string[]
    preferences?: ChatPreferences
  } | null
}

type Material = Tables<"materials">
interface MaterialResponse {
  material: Material
  pages: MaterialPage[]
  fileUrl?: string
  media?: MaterialMedia
}

export function ConnectedMaterial({
  initialMaterial,
  spaces,
  userName,
  signOutAction,
  createSpaceAction,
  recentMaterials = [],
  contextMaterials = [],
  initialReadingPosition = { page: 1, activeTab: "chat" },
  initialShowSource = false,
  embedded = false,
  initialTab,
}: {
  initialMaterial: Material
  spaces: StudySpace[]
  userName: string
  signOutAction: () => Promise<void>
  createSpaceAction?: CreateSpaceAction
  recentMaterials?: RecentMaterial[]
  contextMaterials?: ChatSourceOption[]
  initialReadingPosition?: ReadingPosition
  initialShowSource?: boolean
  embedded?: boolean
  initialTab?: "chat" | "learn"
}) {
  const router = useRouter()
  const query = useSearchParams()
  const exam = embedded ? null : query.get("exam")
  const [retainedExam, setRetainedExam] = useState(exam)
  const examView = exam ?? retainedExam
  useEffect(() => {
    if (exam) setRetainedExam(exam)
  }, [exam])
  function changeExam(id: string | null, replace = false): void {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("exam", id)
    else url.searchParams.delete("exam")
    url.searchParams.delete("attempt")
    window.history[replace ? "replaceState" : "pushState"](null, "", url)
  }
  const standalone = initialMaterial.source_type === "chat"
  const [materialDialog, setMaterialDialog] =
    useState<MaterialInputKind | null>(null)
  const newSpace = useCreateSpace(createSpaceAction)
  const [sourceLoading, setSourceLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [sourceError, setSourceError] = useState("")
  const [readingError, setReadingError] = useState("")
  const readingPosition = useRef(initialReadingPosition)
  const readingSaves = useRef<Promise<void>>(Promise.resolve())
  const [data, setData] = useState<MaterialResponse>({
    material: initialMaterial,
    pages: [],
  })
  const material =
    Date.parse(initialMaterial.updated_at) >
    Date.parse(data.material.updated_at)
      ? {
          ...data.material,
          title: initialMaterial.title,
          space_id: initialMaterial.space_id,
          folder_id: initialMaterial.folder_id,
          location_revision: initialMaterial.location_revision,
        }
      : data.material
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [messages, setMessages] = useState<StudyMessage[]>([])
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [sourceIds, setSourceIds] = useState<string[]>(
    standalone ? [] : [initialMaterial.id]
  )
  const [preferences, setPreferences] = useState<ChatPreferences>({
    ...DEFAULT_CHAT_PREFERENCES,
  })
  const [availableModels, setAvailableModels] = useState<ChatModelOption[]>([])
  const [webSearchAvailable, setWebSearchAvailable] = useState(false)
  const preferenceSaves = useRef<Promise<void>>(Promise.resolve())
  const resumedPrompt = useRef<string | null>(null)
  const activeAnswer = useRef<{
    requestId: string
    controller: AbortController
  } | null>(null)
  const applyChat = useCallback(
    (result: ChatSnapshot) => {
      setMessages(result.messages)
      setConversations(result.conversations)
      setConversationId(result.conversationId)
      setSourceIds(
        result.sourceIds.length || standalone
          ? result.sourceIds
          : [initialMaterial.id]
      )
      setPreferences(result.preferences ?? { ...DEFAULT_CHAT_PREFERENCES })
      if (result.availableModels) setAvailableModels(result.availableModels)
      if (result.webSearchAvailable !== undefined)
        setWebSearchAvailable(result.webSearchAvailable)
    },
    [initialMaterial.id, standalone]
  )
  const resumeSavedPrompt = useEffectEvent(
    (prompt: NonNullable<ChatSnapshot["pendingPrompt"]>) => {
      if (resumedPrompt.current === prompt.requestId) return
      resumedPrompt.current = prompt.requestId
      void ask(prompt.question, prompt).then((result) => {
        if (result.error) setError(result.error)
      })
    }
  )
  const saveReadingPosition = useCallback(
    (change: { page?: number; activeTab?: string; timeMs?: number }) => {
      if (change.page !== undefined) {
        const url = new URL(window.location.href)
        if (url.searchParams.has("page")) {
          url.searchParams.set("page", String(change.page))
          window.history.replaceState(null, "", url)
        }
      }
      if (change.timeMs !== undefined) {
        const url = new URL(window.location.href)
        if (url.searchParams.has("t")) {
          url.searchParams.set("t", String(change.timeMs / 1000))
          window.history.replaceState(null, "", url)
        }
      }
      readingPosition.current = {
        page: change.page ?? readingPosition.current.page,
        timeMs: change.timeMs ?? readingPosition.current.timeMs,
        activeTab:
          change.activeTab === "learn"
            ? "learn"
            : change.activeTab === "chat"
              ? "chat"
              : readingPosition.current.activeTab,
      }
      const payload = {
        ...readingPosition.current,
        version: initialMaterial.extraction_version,
      }
      readingSaves.current = readingSaves.current.then(async () => {
        try {
          const response = await fetch(
            `/api/materials/${initialMaterial.id}/reading-state`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              keepalive: true,
            }
          )
          setReadingError(
            response.ok
              ? ""
              : "Your reading position could not be saved. Refresh if this material changed."
          )
        } catch {
          setReadingError(
            "Your reading position could not be saved. Check your connection."
          )
        }
      })
    },
    [initialMaterial.id, initialMaterial.extraction_version]
  )
  useEffect(() => {
    saveReadingPosition({})
  }, [saveReadingPosition])
  useEffect(() => {
    const controller = new AbortController()
    const selectedConversation = query.get("conversation")
    fetch(
      `/api/materials/${initialMaterial.id}/chat${selectedConversation ? `?${new URLSearchParams({ conversationId: selectedConversation })}` : ""}`,
      {
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Your conversation could not be loaded.")
        const snapshot = (await response.json()) as ChatSnapshot
        if (controller.signal.aborted) return
        applyChat(snapshot)
        if (snapshot.pendingPrompt) resumeSavedPrompt(snapshot.pendingPrompt)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Your conversation could not be loaded. Please refresh.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [initialMaterial.id, applyChat])
  useEffect(() => {
    if (
      sending ||
      !conversationId ||
      !messages.some((message) => message.state === "pending")
    )
      return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(
        `/api/materials/${initialMaterial.id}/chat?conversationId=${conversationId}`,
        { signal: controller.signal }
      )
        .then(async (response) => {
          if (response.ok) applyChat((await response.json()) as ChatSnapshot)
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Your conversation is reconnecting. Refresh to try again.")
        })
    }, 1500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [messages, conversationId, sending, initialMaterial.id, applyChat])
  useEffect(() => () => activeAnswer.current?.controller.abort(), [])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function load() {
      let delay = 5_000
      try {
        const response = await fetch(`/api/materials/${initialMaterial.id}`, {
          signal: controller.signal,
        })
        if (!response.ok)
          throw new Error("Your material could not be refreshed. Reconnecting…")
        const next: MaterialResponse = await response.json()
        if (!active) return
        setData(next)
        setSourceError("")
        delay = ["ready", "partial", "failed", "awaiting_upload"].includes(
          next.material.status
        )
          ? 240_000
          : 2_000
      } catch (cause) {
        if (active)
          setSourceError(
            cause instanceof Error ? cause.message : "Connection interrupted."
          )
      }
      if (active) {
        setSourceLoading(false)
        timer = setTimeout(load, delay)
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
    }
  }, [initialMaterial.id, refresh])

  async function retry() {
    const response = await fetch(
      `/api/materials/${initialMaterial.id}/complete`,
      { method: "POST" }
    )
    if (!response.ok) {
      setError(
        "We could not retry this material. Please choose the same file from Upload."
      )
      return
    }
    setRefresh((value) => value + 1)
  }
  async function addMaterial(
    draft: MaterialDraft,
    options?: UploadOptions
  ): Promise<{ error?: string }> {
    try {
      const result =
        draft.kind === "link"
          ? await importYouTube(
              draft.url,
              material.space_id,
              material.folder_id
            )
          : draft.kind === "paste"
            ? await importPastedText(
                draft.text,
                material.space_id,
                material.folder_id
              )
            : await uploadMaterial(
                draft.file,
                material.space_id,
                material.folder_id,
                options
              )
      setMaterialDialog(null)
      router.push(`/materials/${result.materialId}`)
      router.refresh()
      return {}
    } catch (cause) {
      return {
        error: options?.signal?.aborted
          ? "Upload paused. Add the same file to resume its saved parts."
          : cause instanceof Error
            ? cause.message
            : "Your upload was interrupted. Please try again.",
      }
    }
  }
  function changePreferences(next: ChatPreferences) {
    setPreferences(next)
    if (!conversationId) return
    const selectedConversation = conversationId
    preferenceSaves.current = preferenceSaves.current.then(async () => {
      try {
        const response = await fetch(
          `/api/materials/${initialMaterial.id}/chat`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: selectedConversation,
              preferences: next,
            }),
          }
        )
        if (!response.ok) throw new Error()
      } catch {
        setError(
          "Your chat settings could not be saved. They will be retried with your next question."
        )
      }
    })
  }

  async function ask(
    question: string,
    savedPrompt?: NonNullable<ChatSnapshot["pendingPrompt"]>
  ): Promise<{ error?: string }> {
    if (activeAnswer.current)
      return { error: "Wait for the current reply or stop it first." }
    const requestId = savedPrompt?.requestId ?? crypto.randomUUID()
    const controller = new AbortController()
    activeAnswer.current = { requestId, controller }
    setSending(true)
    setError("")
    try {
      await preferenceSaves.current
      const response = await fetch(
        `/api/materials/${initialMaterial.id}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            requestId,
            conversationId: savedPrompt?.conversationId ?? conversationId,
            sourceIds: savedPrompt?.sourceIds ?? sourceIds,
            preferences: savedPrompt?.preferences ?? preferences,
          }),
          signal: controller.signal,
        }
      )
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/x-ndjson")
      ) {
        const result = (await response.json()) as ChatSnapshot & {
          error?: string
        }
        if (result.messages) applyChat(result)
        return response.ok
          ? {}
          : { error: result.error ?? "Your question could not be answered." }
      }
      if (!response.body)
        return {
          error: "The reply could not be opened. Refresh your conversation.",
        }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let finished = false
      let errorMessage: string | undefined
      try {
        while (true) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line) continue
            const event = JSON.parse(line) as ChatSnapshot & {
              type: string
              text?: string
              error?: string
            }
            if (event.type === "delta")
              setMessages((current) =>
                current.map((message) =>
                  message.requestId === requestId &&
                  message.role === "assistant"
                    ? { ...message, text: event.text ?? "" }
                    : message
                )
              )
            else {
              if (event.messages) applyChat(event)
              if (event.type === "done" || event.type === "error")
                finished = true
              errorMessage = event.error ?? errorMessage
            }
          }
          if (done) break
        }
      } finally {
        reader.releaseLock()
      }
      return finished
        ? { error: errorMessage }
        : {
            error:
              "The connection ended before this reply finished. Refresh to recover saved work.",
          }
    } catch {
      if (controller.signal.aborted)
        return { error: "Reply stopped. You can retry your question." }
      return {
        error:
          "Connection interrupted. Your question may be saved; refresh before trying again.",
      }
    } finally {
      activeAnswer.current = null
      setSending(false)
    }
  }
  async function selectConversation(id: string) {
    setHistoryLoading(true)
    try {
      const response = await fetch(
        `/api/materials/${initialMaterial.id}/chat?conversationId=${id}`
      )
      if (!response.ok)
        throw new Error("Your conversation could not be loaded.")
      applyChat((await response.json()) as ChatSnapshot)
    } catch {
      setError("Your conversation could not be loaded. Please try again.")
    } finally {
      setHistoryLoading(false)
    }
  }
  async function stopAnswer() {
    const requestId =
      activeAnswer.current?.requestId ??
      [...messages]
        .reverse()
        .find(
          (message) => message.state === "pending" || message.state === "queued"
        )?.requestId
    if (!requestId) return
    try {
      const response = await fetch(
        `/api/materials/${initialMaterial.id}/chat`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
          keepalive: true,
        }
      )
      if (!response.ok) throw new Error("Reply could not be stopped.")
      activeAnswer.current?.controller.abort()
      setMessages((current) =>
        current.map((message) =>
          message.requestId === requestId
            ? { ...message, state: "stopped", citations: [] }
            : message
        )
      )
    } catch {
      setError("The reply could not be stopped. Refresh to check its status.")
    }
  }
  const state = data.material.status
  const conversationReady = messages.some(
    (message) =>
      message.role === "assistant" &&
      message.state === "complete" &&
      Boolean(message.text.trim())
  )
  const canCreateExam =
    (state === "ready" || state === "partial") &&
    !historyLoading &&
    !sending &&
    !messages.some((message) =>
      ["pending", "queued"].includes(message.state ?? "")
    ) &&
    (sourceIds.length > 0 || Boolean(conversationId && conversationReady))
  const space = spaces.find((item) => item.id === material.space_id)
  const folder = space?.folders?.find((item) => item.id === material.folder_id)
  const navigationMaterials = [
    {
      id: data.material.id,
      title: material.title,
      spaceId: material.space_id,
      folderId: material.folder_id,
      sourceType: data.material.source_type,
    },
    ...recentMaterials.filter((item) => item.id !== data.material.id),
  ]
  const workspaceContent = (
    <>
      {(error || sourceError || readingError) && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>
            {error || sourceError || readingError}
          </AlertDescription>
        </Alert>
      )}
      <MaterialWorkspace
        key={`${data.material.id}:${data.material.extraction_version}`}
        studyOnly={embedded}
        sourceContentOpen={Boolean(exam)}
        sourceContent={
          examView ? (
            <AssessmentPage
              key={examView}
              embedded
              studySetId={examView === "new" ? undefined : examView}
              initialAttemptId={query.get("attempt") ?? undefined}
              materialId={data.material.id}
              sources={contextMaterials}
              sourceTitle={space?.title ?? material.title}
              initialSourceIds={
                query.has("sourceIds")
                  ? query
                      .get("sourceIds")!
                      .split(",")
                      .filter(Boolean)
                      .slice(0, 3)
                  : sourceIds
              }
              conversationId={standalone ? conversationId : undefined}
              conversationReady={conversationReady}
              allowConversationBasis={standalone && Boolean(conversationId)}
              onBack={() => changeExam(null)}
              onCreated={(id) => changeExam(id, true)}
            />
          ) : undefined
        }
        initialPage={initialReadingPosition.page}
        initialShowSource={initialShowSource}
        initialTab={initialTab ?? initialReadingPosition.activeTab}
        initialTimeMs={initialReadingPosition.timeMs}
        onPageChange={(page) => saveReadingPosition({ page })}
        onTabChange={(activeTab) => saveReadingPosition({ activeTab })}
        onMediaPositionChange={(timeMs, page) =>
          saveReadingPosition({ timeMs, page })
        }
        onSourceRefresh={() => setRefresh((value) => value + 1)}
        sourceLoading={sourceLoading}
        historyLoading={historyLoading}
        material={{
          id: data.material.id,
          title: material.title,
          status:
            state === "ready" || state === "partial" || state === "failed"
              ? state
              : "processing",
          pageCount: data.pages.length,
          extractionVersion: data.material.extraction_version,
          error:
            state === "failed"
              ? data.material.source_type === "youtube"
                ? data.material.error_code === "youtube_import_cost_limit"
                  ? "This video exceeds this import's processing limit. Choose a shorter video or upload its file instead."
                  : "This video could not be imported. Try another public video or upload its file instead."
                : data.material.error_code?.includes("transcription") &&
                    data.material.error_code?.includes("quota")
                  ? "This material exceeds your remaining transcription minutes. Your original file is kept; review your usage before retrying."
                  : data.material.error_code?.includes("quota_exceeded")
                    ? "This material exceeds your remaining document or scanned-page allowance. Your original is kept; review your usage before retrying."
                    : data.material.source_type === "text"
                      ? "Your text could not be processed. Check its length and try again."
                      : ["audio", "video"].includes(data.material.source_type)
                        ? "This audio or video could not be processed. Your original file is kept; check the source and try again."
                        : "We couldn’t read this document. Check that it opens correctly, then retry."
              : undefined,
        }}
        pages={data.pages}
        sourceKind={
          data.material.source_type === "text" ||
          data.material.source_type === "chat" ||
          data.material.source_type === "docx" ||
          data.material.source_type === "pptx" ||
          data.material.source_type === "audio" ||
          data.material.source_type === "youtube" ||
          data.material.source_type === "video"
            ? data.material.source_type
            : "pdf"
        }
        fileUrl={data.fileUrl}
        media={data.media}
        awaitingUpload={state === "awaiting_upload"}
        onRetry={state === "failed" ? retry : undefined}
        messages={messages}
        sending={sending}
        contextMaterials={
          standalone || contextMaterials.length
            ? contextMaterials
            : [{ id: data.material.id, title: material.title }]
        }
        selectedSourceIds={sourceIds}
        preferences={preferences}
        availableModels={availableModels}
        webSearchAvailable={webSearchAvailable}
        onPreferencesChange={changePreferences}
        onSourcesChange={setSourceIds}
        conversations={conversations}
        conversationId={conversationId}
        onConversationChange={selectConversation}
        onNewConversation={() => {
          setConversationId(null)
          setMessages([])
          setSourceIds(standalone ? [] : [data.material.id])
        }}
        onStop={() => {
          void stopAnswer()
        }}
        onAsk={state === "ready" || state === "partial" ? ask : undefined}
      />
      <MaterialDialog
        kind={materialDialog}
        onClose={() => setMaterialDialog(null)}
        onSubmit={addMaterial}
      />
    </>
  )
  if (embedded)
    return (
      <div className="flex h-full min-h-0 flex-col">{workspaceContent}</div>
    )

  return (
    <WorkspaceShell
      fixedContent
      title={
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2"
        >
          <a
            className="hidden max-w-40 truncate text-muted-foreground hover:text-foreground sm:block"
            href={space ? `/spaces/${space.id}` : "/library"}
          >
            {space?.title ?? "My Library"}
          </a>
          <span
            aria-hidden="true"
            className="hidden text-muted-foreground sm:inline"
          >
            /
          </span>
          {space && folder && (
            <>
              <a
                className="hidden max-w-40 truncate text-muted-foreground hover:text-foreground sm:block"
                href={`/spaces/${space.id}?folderId=${folder.id}`}
              >
                {folder.title}
              </a>
              <span
                aria-hidden="true"
                className="hidden text-muted-foreground sm:inline"
              >
                /
              </span>
            </>
          )}
          <span className="truncate">{material.title}</span>
        </nav>
      }
      actions={
        <Button
          variant="outline"
          className="shrink-0 rounded-full"
          disabled={!exam && !canCreateExam}
          aria-pressed={Boolean(exam)}
          onClick={() => changeExam(exam ? null : "new")}
        >
          <Book aria-hidden="true" data-icon="inline-start" />
          {exam ? "Close Exam" : "New Exam"}
        </Button>
      }
      spaces={spaces}
      recentMaterials={navigationMaterials}
      activeMaterialId={data.material.id}
      activeSpaceId={material.space_id}
      activeFolderId={material.folder_id}
      userName={userName}
      signOutAction={signOutAction}
      onAddMaterial={() => setMaterialDialog("upload")}
      onCreateSpace={() => void newSpace.createSpace()}
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
    >
      {workspaceContent}
    </WorkspaceShell>
  )
}
