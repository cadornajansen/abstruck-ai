"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Globe, ShareAndroid, Trash } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import { Spinner } from "@workspace/ui/components/spinner"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Input } from "@workspace/ui/components/input"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import type { ShareMetadata, SharePreview } from "@/lib/sharing-types"
import { SharingSnapshot } from "./sharing-snapshot"
import { sharingError, sharingRequest } from "./sharing-request"

function shareDate(value: string): string {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ShareOutputAction({
  studySetId,
  versionId,
  disabled = false,
  beforeOpen,
}: {
  studySetId: string
  versionId?: string
  disabled?: boolean
  beforeOpen?: () => Promise<number | null>
}) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const [preparing, setPreparing] = useState(false)
  const [revision, setRevision] = useState<number | undefined>()
  const [error, setError] = useState("")
  const preparingRef = useRef(false)

  async function show(): Promise<void> {
    if (disabled || preparingRef.current) return
    preparingRef.current = true
    setPreparing(true)
    setError("")
    try {
      const savedRevision = beforeOpen ? await beforeOpen() : undefined
      if (savedRevision === null) return
      setRevision(savedRevision)
      setSession((value) => value + 1)
      setOpen(true)
    } catch {
      setError("Save this output before opening sharing.")
    } finally {
      preparingRef.current = false
      setPreparing(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={preparing ? "Saving before sharing" : "Share saved output"}
        title={error || "Share saved output"}
        disabled={disabled || preparing}
        onClick={() => void show()}
      >
        {preparing ? <Spinner /> : <ShareAndroid aria-hidden="true" />}
      </Button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
      <ShareOutputDialog
        key={session}
        open={open}
        onOpenChange={setOpen}
        studySetId={studySetId}
        versionId={versionId}
        expectedRevision={revision}
      />
    </>
  )
}

function ShareOutputDialog({
  open,
  onOpenChange,
  studySetId,
  versionId,
  expectedRevision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studySetId: string
  versionId?: string
  expectedRevision?: number
}) {
  const [includeOriginals, setIncludeOriginals] = useState(false)
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [shares, setShares] = useState<ShareMetadata[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [listError, setListError] = useState("")
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<{
    id: string
    url: string
  } | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ShareMetadata | null>(null)
  const requestId = useRef<string | null>(null)
  const busyRef = useRef(false)
  const changedElsewhere =
    preview &&
    expectedRevision !== undefined &&
    preview.revision !== expectedRevision

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setPreview(null)
    setError("")
    setMessage("")
    setShareLink(null)
    requestId.current = null
    const query = new URLSearchParams({
      includeOriginals: String(includeOriginals),
    })
    if (versionId) query.set("versionId", versionId)
    sharingRequest<{ preview: SharePreview }>(
      `/api/study-sets/${studySetId}/share-preview?${query}`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result.preview)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(sharingError(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, studySetId, versionId, includeOriginals, revision])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    sharingRequest<{ shares: ShareMetadata[] }>(
      `/api/shares?studySetId=${studySetId}`,
      {
        signal: controller.signal,
      }
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setShares(result.shares)
          setListError("")
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setListError(sharingError(cause))
      })
    return () => controller.abort()
  }, [open, studySetId, revision])

  async function create(): Promise<void> {
    if (!preview || loading || changedElsewhere || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setCreating(true)
    setError("")
    setMessage("")
    try {
      requestId.current ??= crypto.randomUUID()
      const result = await sharingRequest<{
        share: ShareMetadata
        url: string
      }>("/api/shares", {
        method: "POST",
        body: JSON.stringify({
          studySetId,
          versionId: preview.versionId,
          revision: preview.revision,
          includeOriginals: preview.includeOriginals,
          requestId: requestId.current,
        }),
      })
      setShares((current) => [
        result.share,
        ...current.filter((item) => item.id !== result.share.id),
      ])
      setShareLink({ id: result.share.id, url: result.url })
      setMessage("Link created. Use Copy link below to send it.")
    } catch (cause) {
      setError(sharingError(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
      setCreating(false)
    }
  }

  async function copy(share: ShareMetadata): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    setMessage("")
    let timer: ReturnType<typeof setTimeout> | undefined
    let linkReady = false
    try {
      const result = await sharingRequest<{ url: string }>(
        `/api/shares/${share.id}/copy`,
        { method: "POST" }
      )
      setShareLink({ id: share.id, url: result.url })
      linkReady = true
      await Promise.race([
        navigator.clipboard.writeText(result.url),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("clipboard_timeout")), 5000)
        }),
      ])
      setCopiedId(share.id)
      setMessage("Link copied. Anyone with it can view this saved output.")
    } catch (cause) {
      if (linkReady) setMessage("Select the link below to copy it manually.")
      else setError(sharingError(cause))
    } finally {
      clearTimeout(timer)
      busyRef.current = false
      setBusy(false)
    }
  }

  async function revoke(): Promise<void> {
    if (!revokeTarget || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      const result = await sharingRequest<{ share: ShareMetadata }>(
        `/api/shares/${revokeTarget.id}`,
        { method: "DELETE" }
      )
      setShares((current) =>
        current.map((share) =>
          share.id === result.share.id ? result.share : share
        )
      )
      setCopiedId(null)
      setShareLink((current) =>
        current?.id === result.share.id ? null : current
      )
      requestId.current = null
      setMessage("Link revoked. New requests can no longer open it.")
      setRevokeTarget(null)
    } catch (cause) {
      setError(sharingError(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[448px]! grid-cols-1 gap-5 overflow-x-hidden overflow-y-auto rounded-[12px] p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              Share saved output
            </DialogTitle>
            <DialogDescription>
              Review the saved version before creating a read-only link.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-[16px] border p-4">
            <Globe aria-hidden="true" className="size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Anyone with the link</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Recipients can view this output without signing in.
              </p>
            </div>
          </div>
          <Field
            orientation="horizontal"
            className="items-center rounded-[16px] border p-4"
          >
            <FieldContent>
              <FieldLabel htmlFor="share-originals">
                Include original files
              </FieldLabel>
              <FieldDescription className="text-xs">
                Off by default. Only this saved version’s selected sources can
                be included.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="share-originals"
              checked={includeOriginals}
              disabled={busy}
              onCheckedChange={setIncludeOriginals}
            />
          </Field>
          {loading && (
            <Skeleton
              className="h-40 w-full rounded-xl"
              aria-label="Loading disclosure preview"
            />
          )}
          {preview && (
            <section
              className="flex min-w-0 flex-col gap-3"
              aria-label="Disclosure preview"
            >
              <h3 className="text-sm font-medium">What recipients will see</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                {preview.disclosure.content}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {preview.disclosure.originals}
              </p>
              <div className="max-h-52 min-w-0 overflow-auto rounded-[16px] border bg-muted/20 p-4">
                <SharingSnapshot snapshot={preview.snapshot} />
              </div>
              {includeOriginals && (
                <ul className="flex flex-col gap-2 text-xs">
                  {preview.sources.map((source) => (
                    <li key={source.key} className="wrap-anywhere">
                      {source.title} ·{" "}
                      {source.available ? source.mime : "Unavailable"}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                {preview.disclosure.limitations}
              </p>
            </section>
          )}
          {changedElsewhere && (
            <Alert>
              <AlertDescription>
                This output changed elsewhere. Close sharing and review the
                latest saved version first.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {message && (
            <p role="status" className="text-sm leading-6">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1 rounded-xl"
              disabled={
                !preview ||
                loading ||
                busy ||
                !!changedElsewhere ||
                (includeOriginals &&
                  preview.sources.some((source) => !source.available))
              }
              onClick={() => void create()}
            >
              {creating && <Spinner />}Create read-only link
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={busy || loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh preview
            </Button>
          </div>
          <section
            className="flex flex-col gap-3 border-t pt-4"
            aria-label="Existing share links"
          >
            <h3 className="text-sm font-medium">Existing links</h3>
            {listError && (
              <p role="alert" className="text-sm text-destructive">
                {listError}
              </p>
            )}
            {!shares.length && !listError && (
              <p className="text-xs text-muted-foreground">
                No links loaded for this output.
              </p>
            )}
            {shares.map((share) => {
              const expired =
                !!share.expiresAt && Date.parse(share.expiresAt) <= Date.now()
              const unavailable = !!share.revokedAt || expired
              return (
                <div
                  key={share.id}
                  className="flex flex-col gap-3 rounded-[16px] border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs leading-5 text-muted-foreground">
                      <p>
                        Version {share.version} · {shareDate(share.createdAt)}
                      </p>
                      <p>
                        {share.includeOriginals
                          ? "Original files included"
                          : "Original files excluded"}
                      </p>
                      {share.expiresAt && (
                        <p>Expires {shareDate(share.expiresAt)}</p>
                      )}
                    </div>
                    <Badge variant="outline">
                      {share.revokedAt
                        ? "Revoked"
                        : expired
                          ? "Expired"
                          : "Active"}
                    </Badge>
                  </div>
                  {!unavailable && shareLink?.id === share.id && (
                    <Field>
                      <FieldLabel htmlFor={`share-link-${share.id}`}>
                        Read-only link
                      </FieldLabel>
                      <Input
                        id={`share-link-${share.id}`}
                        readOnly
                        value={shareLink.url}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </Field>
                  )}
                  {!unavailable && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void copy(share)}
                      >
                        {copiedId === share.id ? <Check /> : <Copy />}Copy link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setRevokeTarget(share)}
                      >
                        <Trash />
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(next) => {
          if (!next && !busy) setRevokeTarget(null)
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-[16px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              New requests will stop working. Previously issued file URLs may
              work for up to 60 seconds. Downloaded copies cannot be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep link</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {busy && <Spinner />}Revoke link
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
