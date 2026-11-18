"use client"

import { useState, type FormEvent } from "react"
import { Download } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { FieldGroup, FieldSet } from "@workspace/ui/components/field"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  OutputTextField,
  StudyOutputFields,
  type EditableStudyOutput,
} from "./study-output-fields"
import { exportStudyOutput } from "./study-output-export"
import { studyOutputTool } from "./study-output-catalog"
import {
  StudyApiError,
  studyError,
  studyRequest,
  type StudySetDetail,
} from "./study-tools-types"

export function StudyOutputEditor({
  output,
  studySetId,
  versionId,
  revision,
  onSaved,
  onCancel,
}: {
  output: EditableStudyOutput
  studySetId: string
  versionId: string
  revision: number
  onSaved: (detail: StudySetDetail) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<EditableStudyOutput>(() =>
    structuredClone(output)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [conflict, setConflict] = useState(false)
  const tool = studyOutputTool(output.kind)
  const dirty = JSON.stringify(draft) !== JSON.stringify(output)
  const invalidNumber =
    (draft.kind === "bar-chart" || draft.kind === "line-chart") &&
    draft.series.some((series) =>
      series.points.some(
        (point) => !Number.isFinite(point.value) || Math.abs(point.value) > 1e12
      )
    )

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || conflict || !dirty || invalidNumber) return
    setSaving(true)
    setError("")
    try {
      const next = await studyRequest<StudySetDetail>(
        `/api/study-sets/${studySetId}/output`,
        {
          method: "PATCH",
          body: JSON.stringify({ versionId, revision, content: draft }),
        }
      )
      onSaved(next)
    } catch (cause) {
      if (cause instanceof StudyApiError && cause.status === 409)
        setConflict(true)
      setError(studyError(cause))
    } finally {
      setSaving(false)
    }
  }

  async function loadLatest() {
    setSaving(true)
    setError("")
    try {
      const next = await studyRequest<StudySetDetail>(
        `/api/study-sets/${studySetId}`
      )
      onSaved(next)
    } catch (cause) {
      setError(studyError(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel()
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 sm:max-w-2xl"
        showCloseButton={!saving}
      >
        <DialogHeader className="pr-5">
          <DialogTitle>Edit {tool.title}</DialogTitle>
          <DialogDescription>
            Save a new version without generating again. Source references stay
            attached. Numbers and dates must still match the saved input.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <FieldSet disabled={saving}>
            <FieldGroup>
              <OutputTextField
                label="Title"
                value={draft.title}
                maxLength={140}
                onChange={(title) =>
                  setDraft((current) => ({ ...current, title }))
                }
              />
              <OutputTextField
                label="Description"
                value={draft.description}
                maxLength={600}
                multiline
                optional
                onChange={(description) =>
                  setDraft((current) => ({ ...current, description }))
                }
              />
              <StudyOutputFields output={draft} onChange={setDraft} />
            </FieldGroup>
          </FieldSet>
          {invalidNumber && (
            <p role="alert" className="text-sm text-destructive">
              Enter a finite value between −1 trillion and 1 trillion for every
              point.
            </p>
          )}
          {conflict ? (
            <Alert>
              <AlertTitle>A newer version was saved</AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                Your draft is still here. Export it before loading the latest
                version if you want to keep these changes.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={saving}
                  onClick={() => exportStudyOutput(draft)}
                >
                  <Download aria-hidden="true" />
                  Export my draft
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={saving}
                  onClick={() => void loadLatest()}
                >
                  Load latest and discard my edits
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={saving}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-full"
              disabled={saving || conflict || !dirty || invalidNumber}
            >
              {saving && <Spinner />}
              {saving ? "Saving…" : "Save new version"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
