"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link as LinkIcon, PasteClipboard, Upload, Xmark } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"
import { Progress } from "@workspace/ui/components/progress"
import {
  fileUploadLimit,
  type UploadOptions,
  type UploadProgress,
} from "@/lib/file-upload"
import { youtubeSource } from "@/lib/youtube"

export type MaterialInputKind = "upload" | "link" | "paste"
export type MaterialDraft =
  | { kind: "upload"; file: File }
  | { kind: "link"; url: string }
  | { kind: "paste"; text: string }

export interface MaterialDialogProps {
  kind: MaterialInputKind | null
  onClose: () => void
  onSubmit?: (
    draft: MaterialDraft,
    options?: UploadOptions
  ) => Promise<{ error?: string }>
}

const sourceCopy = {
  upload: {
    title: "Upload content",
    description: "Add a document up to 50 MB, or audio/video up to 250 MB.",
    icon: Upload,
  },
  link: {
    title: "YouTube",
    description:
      "Add a public YouTube video to study with its timestamped transcript.",
    icon: LinkIcon,
  },
  paste: {
    title: "Paste Text",
    description: "Copy and paste text to add as content",
    icon: PasteClipboard,
  },
} satisfies Record<
  MaterialInputKind,
  { title: string; description: string; icon: typeof Upload }
>

function MaterialForm({
  kind,
  onSubmit,
  onClose,
}: Required<Pick<MaterialDialogProps, "onClose">> & {
  kind: MaterialInputKind
  onSubmit?: MaterialDialogProps["onSubmit"]
}) {
  const [value, setValue] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [transcriptionLanguage, setTranscriptionLanguage] =
    useState<NonNullable<UploadOptions["transcriptionLanguage"]>>("auto")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const copy = sourceCopy[kind]
  const Icon = copy.icon

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setUnavailable(false)
    if (kind === "link" && !youtubeSource(value.trim())) {
      setError(
        "Enter a link to one public YouTube video. Playlists and other websites are not supported yet."
      )
      return
    }
    if (kind === "paste" && !value.trim()) {
      setError("Paste some text before adding it.")
      return
    }
    if (
      kind === "upload" &&
      (!file ||
        !/\.(pdf|docx|pptx|mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(file.name) ||
        file.size === 0 ||
        file.size > fileUploadLimit(file.name))
    ) {
      setError("Choose a document up to 50 MB, or audio/video up to 250 MB.")
      return
    }
    if (!onSubmit) {
      setUnavailable(true)
      return
    }
    const draft: MaterialDraft =
      kind === "upload"
        ? { kind, file: file! }
        : kind === "link"
          ? { kind, url: value.trim() }
          : { kind, text: value.trim() }
    setPending(true)
    setProgress(null)
    controller.current = new AbortController()
    try {
      const result = await onSubmit(draft, {
        signal: controller.current.signal,
        onProgress: setProgress,
        transcriptionLanguage,
      })
      if (result.error) setError(result.error)
      else onClose()
    } catch {
      setError(
        controller.current.signal.aborted
          ? "Upload paused. Add the same file to resume its saved parts."
          : "We couldn’t add this material. Your input is still here. Try again."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-5" />
          {copy.title}
        </DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`material-${kind}`} className="sr-only">
            {kind === "link"
              ? "YouTube video URL"
              : kind === "paste"
                ? "Paste your notes here"
                : "Choose a file"}
          </FieldLabel>
          {kind === "upload" ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5">
              <Upload
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-center text-sm">
                Choose a file to start learning
              </p>
              <Input
                id="material-upload"
                type="file"
                accept=".pdf,.docx,.pptx,.mp3,.m4a,.wav,.ogg,.mp4,.mov,.webm"
                aria-invalid={!!error}
                aria-describedby="material-file-help"
                disabled={pending}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setError("")
                }}
                className="max-w-full"
              />
              <FieldDescription id="material-file-help">
                PDF, DOCX, PPTX · up to 50 MB. MP3, M4A, WAV, OGG, MP4, MOV,
                WEBM · up to 250 MB. Your remaining storage allowance applies.
              </FieldDescription>
            </div>
          ) : kind === "paste" ? (
            <Textarea
              id="material-paste"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Paste your notes here"
              rows={5}
              className="min-h-32 rounded-2xl"
              aria-invalid={!!error}
              disabled={pending}
            />
          ) : (
            <Input
              id="material-link"
              type="url"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://youtu.be/..."
              autoComplete="off"
              className="h-12 rounded-2xl"
              aria-invalid={!!error}
              disabled={pending}
            />
          )}
          {error && <FieldError>{error}</FieldError>}
          {kind === "paste" && (
            <FieldDescription>
              Up to 100 KB of text and 200 paragraphs. Your document allowance
              applies.
            </FieldDescription>
          )}
          {kind === "link" && (
            <FieldDescription>
              One public video up to 1 hour. Playlists and live streams aren’t
              supported.
            </FieldDescription>
          )}
        </Field>
        {kind === "upload" &&
          file &&
          /\.(mp3|m4a|wav|ogg|mp4|mov|webm)$/i.test(file.name) && (
            <Field>
              <FieldLabel htmlFor="material-language">
                Audio language
              </FieldLabel>
              <NativeSelect
                id="material-language"
                value={transcriptionLanguage}
                disabled={pending}
                onChange={(event) =>
                  setTranscriptionLanguage(
                    event.target.value as NonNullable<
                      UploadOptions["transcriptionLanguage"]
                    >
                  )
                }
              >
                <NativeSelectOption value="auto">
                  Auto detect
                </NativeSelectOption>
                <NativeSelectOption value="en">English</NativeSelectOption>
                <NativeSelectOption value="tl">
                  Filipino / Tagalog
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                For mixed Filipino and English audio, choose Filipino.
              </FieldDescription>
            </Field>
          )}
      </FieldGroup>
      {unavailable && (
        <Alert>
          <AlertTitle>Import setup is in progress</AlertTitle>
          <AlertDescription>
            Your material has not been uploaded or saved. You can keep this
            dialog open and try again after setup is complete.
          </AlertDescription>
        </Alert>
      )}
      {pending && kind === "upload" && progress && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground" role="status">
            {progress.phase === "checking"
              ? "Checking file…"
              : progress.phase === "confirming"
                ? "Confirming upload…"
                : `Uploading… ${Math.round((progress.uploadedBytes / progress.totalBytes) * 100)}%`}
          </p>
          <Progress
            aria-label="File upload"
            value={
              progress.phase === "uploading"
                ? (progress.uploadedBytes / progress.totalBytes) * 100
                : null
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => controller.current?.abort()}
          >
            Pause upload
          </Button>
        </div>
      )}
      <Button
        type="submit"
        className="h-12 w-full rounded-2xl"
        disabled={pending || (kind === "upload" ? !file : !value.trim())}
      >
        {pending && <Spinner data-icon="inline-start" />}{" "}
        {pending ? "Adding…" : "Add"}
      </Button>
    </form>
  )
}

export function MaterialDialog({
  kind,
  onClose,
  onSubmit,
}: MaterialDialogProps) {
  return (
    <Dialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto rounded-3xl p-6 sm:max-w-[500px]"
      >
        {kind && (
          <MaterialForm
            key={kind}
            kind={kind}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        )}
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              className="absolute top-2 right-2"
            />
          }
        >
          <Xmark aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
