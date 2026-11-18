"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, NavArrowLeft } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { ShareOutputAction } from "./sharing-dialog"
import {
  StudyApiError,
  studyRequest,
  studyError,
  exportStudyMarkdown,
  type StudySet,
} from "./study-tools-types"

export function StudyNote({
  note,
  onSaved,
  onBack,
}: {
  note: StudySet
  onSaved: (set: StudySet) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [saved, setSaved] = useState(note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [remote, setRemote] = useState<StudySet | null>(null)
  const [resolving, setResolving] = useState(false)
  const [merged, setMerged] = useState("")
  const [mergedTitle, setMergedTitle] = useState("")
  const savingRef = useRef(false)
  const changed = title !== saved.title || content !== saved.content

  const save = useCallback(
    async (
      nextTitle: string,
      nextContent: string,
      revision: number
    ): Promise<StudySet | null> => {
      if (savingRef.current) return null
      if (!nextTitle.trim()) {
        setError("Give your note a title before saving.")
        return null
      }
      savingRef.current = true
      setSaving(true)
      setError("")
      try {
        const result = await studyRequest<{ studySet: StudySet }>(
          `/api/study-sets/${note.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: nextTitle.trim(),
              content: nextContent,
              revision,
            }),
          }
        )
        setSaved(result.studySet)
        setTitle((current) =>
          current === nextTitle ? result.studySet.title : current
        )
        setRemote(null)
        onSaved(result.studySet)
        return result.studySet
      } catch (cause) {
        if (
          cause instanceof StudyApiError &&
          cause.status === 409 &&
          cause.studySet
        )
          setRemote(cause.studySet)
        else setError(studyError(cause))
        return null
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [note.id, onSaved]
  )

  useEffect(() => {
    if (!changed || saving || remote || error || !title.trim()) return
    const timer = setTimeout(() => {
      void save(title, content, saved.revision)
    }, 800)
    return () => clearTimeout(timer)
  }, [changed, saving, remote, error, title, content, saved.revision, save])

  useEffect(() => {
    if (!changed && !saving) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [changed, saving])

  async function back() {
    if (saving || remote) return
    if (!changed || (await save(title, content, saved.revision))) onBack()
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void back()}
          disabled={saving || !!remote}
          className="rounded-full"
        >
          <NavArrowLeft aria-hidden="true" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-muted-foreground">
            {saving
              ? "Saving…"
              : remote
                ? "Changes need review"
                : error
                  ? "Not saved"
                  : changed
                    ? "Unsaved changes"
                    : "Saved"}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Export note as Markdown"
            onClick={() => exportStudyMarkdown(title, content)}
          >
            <Download aria-hidden="true" />
          </Button>
          <ShareOutputAction
            studySetId={note.id}
            disabled={saving || !!remote || !title.trim()}
            beforeOpen={async () => {
              if (savingRef.current || remote) return null
              if (!changed) return saved.revision
              const result = await save(title, content, saved.revision)
              return result?.revision ?? null
            }}
          />
        </div>
      </div>
      {remote && (
        <Alert>
          <AlertTitle>This note changed elsewhere</AlertTitle>
          <AlertDescription>
            Your draft is kept here. Review the saved version before choosing
            what to keep.
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMerged(content)
                  setMergedTitle(title)
                  setResolving(true)
                }}
              >
                Review changes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitle(remote.title)
                  setContent(remote.content)
                  setSaved(remote)
                  onSaved(remote)
                  setRemote(null)
                  setError("")
                }}
              >
                Use latest saved note
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void save(title, content, saved.revision)}
              className="mt-3 w-fit"
            >
              Retry save
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Input
        aria-label="Note title"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setError("")
        }}
        maxLength={240}
        className="h-12 rounded-none border-0 px-0 text-xl! font-medium shadow-none focus-visible:ring-0"
      />
      <Textarea
        aria-label="Note content"
        value={content}
        onChange={(event) => {
          setContent(event.target.value)
          setError("")
        }}
        maxLength={100000}
        placeholder="Start writing your notes…"
        className="min-h-80 flex-1 resize-none rounded-none border-0 p-0 text-base! leading-7 shadow-none focus-visible:ring-0"
      />
      <p className="text-xs text-muted-foreground">
        Notes save automatically. Writing and exporting a note does not use an
        AI allowance.
      </p>
      <Dialog
        open={resolving}
        onOpenChange={(open) => {
          if (!saving) setResolving(open)
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review note changes</DialogTitle>
            <DialogDescription>
              Compare the latest saved title and text with your draft. Edit the
              final copy below, then save it.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel>Latest saved note</FieldLabel>
            <div className="max-h-40 overflow-y-auto rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              <p className="mb-2 font-medium">{remote?.title}</p>
              {remote?.content || "This saved note is empty."}
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="merged-title">Final title</FieldLabel>
            <Input
              id="merged-title"
              value={mergedTitle}
              onChange={(event) => setMergedTitle(event.target.value)}
              maxLength={240}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="merged-note">Your final copy</FieldLabel>
            <Textarea
              id="merged-note"
              value={merged}
              onChange={(event) => setMerged(event.target.value)}
              maxLength={100000}
              className="min-h-48"
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            disabled={saving || !remote || !mergedTitle.trim()}
            onClick={async () => {
              if (
                remote &&
                (await save(mergedTitle, merged, remote.revision))
              ) {
                setTitle(mergedTitle.trim())
                setContent(merged)
                setResolving(false)
              }
            }}
          >
            {saving && <Spinner />}Save reviewed changes
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
