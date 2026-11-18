"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Download, Trash } from "iconoir-react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import type {
  AccountDataKind,
  AccountDataRequest,
  AccountDataResponse,
} from "@/lib/account-data-types"

export type AccountDataRequestIds = Record<AccountDataKind, string | null>
type AccountDataAction = () => Promise<{ error?: string; message?: string }>

interface AccountDataControlsProps {
  active: boolean
  preview: boolean
  disabled: boolean
  requestIds: RefObject<AccountDataRequestIds>
  onPendingChange: (pending: boolean) => void
  requestExportAction?: AccountDataAction
  requestDeletionAction?: AccountDataAction
}

async function accountDataRequest(
  path: string,
  init?: RequestInit
): Promise<AccountDataResponse> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  init?.signal?.addEventListener("abort", cancel, { once: true })
  if (init?.signal?.aborted) controller.abort()
  const timeout = window.setTimeout(cancel, 15_000)
  try {
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })
    let result: AccountDataResponse & { error?: string }
    try {
      result = await response.json()
    } catch {
      throw new Error("We couldn’t read your request status. Please try again.")
    }
    if (!response.ok)
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "Your request could not be checked. Please try again."
      )
    return result as AccountDataResponse
  } catch (cause) {
    if (!init?.signal?.aborted && controller.signal.aborted)
      throw new Error(
        "The request timed out. Check its status or retry your request."
      )
    if (cause instanceof TypeError)
      throw new Error(
        "We couldn’t connect. Check your request status or retry the same request."
      )
    throw cause
  } finally {
    window.clearTimeout(timeout)
    init?.signal?.removeEventListener("abort", cancel)
  }
}

function dataError(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Your request couldn’t be completed. Please try again."
}

function deletionAccepted(): void {
  const message =
    "Your account deletion request was accepted. Data cleanup will continue after sign-out."
  window.location.replace(`/sign-in?message=${encodeURIComponent(message)}`)
}

function useAccountDataRequest(
  kind: AccountDataKind,
  active: boolean,
  requestIds: RefObject<AccountDataRequestIds>
) {
  const [request, setRequest] = useState<AccountDataRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [known, setKnown] = useState(false)
  const [pending, setPending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState("")
  const [paused, setPaused] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const pendingRef = useRef(false)
  const mounted = useRef(true)
  const mutation = useRef<AbortController | null>(null)
  const check = useCallback(() => setRefresh((value) => value + 1), [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      mutation.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!active || leaving) return
    const controller = new AbortController()
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    let reads = 0
    setLoading(true)
    setPaused(false)
    async function read(): Promise<void> {
      try {
        const id = requestIds.current[kind]
        const result = await accountDataRequest(
          `/api/account/${kind}${id ? `?requestId=${encodeURIComponent(id)}` : ""}`,
          { signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setRequest(result.request)
        setKnown(true)
        setError("")
        reads += 1
        if (kind === "deletion" && result.signOut) {
          setLeaving(true)
          deletionAccepted()
          return
        }
        if (
          kind === "export" &&
          result.request &&
          ["queued", "running"].includes(result.request.status)
        ) {
          if (reads < 40 && Date.now() - startedAt < 120_000)
            timer = setTimeout(() => void read(), 3000)
          else setPaused(true)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(dataError(cause))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void read()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [active, kind, leaving, refresh, requestIds])

  async function submit(newRequest: boolean): Promise<void> {
    if (pendingRef.current || leaving) return
    pendingRef.current = true
    const controller = new AbortController()
    mutation.current = controller
    setPending(true)
    setError("")
    if (newRequest || !requestIds.current[kind])
      requestIds.current[kind] = crypto.randomUUID()
    try {
      const result = await accountDataRequest(`/api/account/${kind}`, {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          requestId: requestIds.current[kind],
          ...(kind === "deletion" ? { confirmation: "DELETE" } : {}),
        }),
      })
      if (!mounted.current) return
      setRequest(result.request)
      setKnown(true)
      if (kind === "deletion") {
        if (!result.signOut)
          throw new Error(
            "Deletion has not been confirmed. Check its status before trying again."
          )
        setLeaving(true)
        deletionAccepted()
      } else check()
    } catch (cause) {
      if (mounted.current) setError(dataError(cause))
    } finally {
      pendingRef.current = false
      if (mounted.current) setPending(false)
    }
  }

  async function download(): Promise<void> {
    if (!request || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError("")
    const controller = new AbortController()
    mutation.current = controller
    try {
      const result = await accountDataRequest(
        `/api/account/export?requestId=${encodeURIComponent(request.id)}`,
        { signal: controller.signal }
      )
      if (!mounted.current) return
      setRequest(result.request)
      if (result.request?.status === "ready" && result.request.downloadUrl)
        window.location.assign(result.request.downloadUrl)
      else
        setError(
          "This download is no longer available. Request a new export if it has expired."
        )
    } catch (cause) {
      if (mounted.current) setError(dataError(cause))
    } finally {
      pendingRef.current = false
      if (mounted.current) setPending(false)
    }
  }

  return {
    request,
    loading,
    known,
    pending: pending || leaving,
    error,
    paused,
    check,
    submit,
    download,
  }
}

function RequestError({
  error,
  onRetry,
  disabled,
}: {
  error: string
  onRetry: () => void
  disabled: boolean
}) {
  return error ? (
    <Alert variant="destructive" className="mt-3">
      <AlertDescription>{error}</AlertDescription>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-fit"
        disabled={disabled}
        onClick={onRetry}
      >
        Check status
      </Button>
    </Alert>
  ) : null
}

export function AccountDataControls({
  active,
  preview,
  disabled,
  requestIds,
  onPendingChange,
  requestExportAction,
  requestDeletionAction,
}: AccountDataControlsProps) {
  const exportData = useAccountDataRequest(
    "export",
    active && !preview && !requestExportAction,
    requestIds
  )
  const deletion = useAccountDataRequest(
    "deletion",
    active && !preview && !requestDeletionAction,
    requestIds
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [customPending, setCustomPending] = useState(false)
  const [customError, setCustomError] = useState("")
  const [message, setMessage] = useState("")
  const submitting = exportData.pending || deletion.pending || customPending
  const busy = disabled || submitting
  const exported = exportData.request
  const preparing =
    exported?.status === "queued" || exported?.status === "running"
  const expired = exported?.status === "ready" && !exported.downloadUrl
  const unconfirmedExport = Boolean(
    requestIds.current.export && requestIds.current.export !== exported?.id
  )
  const newExport =
    !unconfirmedExport && (expired || exported?.status === "failed")
  const deletionPending =
    deletion.request?.status === "queued" ||
    deletion.request?.status === "running"
  const unconfirmedDeletion = Boolean(
    requestIds.current.deletion &&
    requestIds.current.deletion !== deletion.request?.id
  )
  const canDelete =
    Boolean(requestDeletionAction) ||
    (!preview &&
      !deletion.loading &&
      !deletionPending &&
      deletion.request?.status !== "ready" &&
      (deletion.known || Boolean(requestIds.current.deletion)))

  useEffect(() => {
    onPendingChange(submitting)
    return () => onPendingChange(false)
  }, [onPendingChange, submitting])

  async function custom(action: AccountDataAction): Promise<void> {
    setCustomPending(true)
    setCustomError("")
    setMessage("")
    try {
      const result = await action()
      if (result.error) setCustomError(result.error)
      else if (result.message) setMessage(result.message)
    } catch (cause) {
      setCustomError(dataError(cause))
    } finally {
      setCustomPending(false)
    }
  }

  return (
    <>
      <section className="border-b pb-6">
        <h3 className="font-medium">Export your data</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Request a copy of your saved study content and account data.
        </p>
        {exportData.loading && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Checking export status…
          </p>
        )}
        {preparing && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Your export is being prepared. You can close Settings and check
            again later.
          </p>
        )}
        {exportData.paused && (
          <p className="mt-2 text-sm text-muted-foreground">
            This is taking longer. Use Check status when you’re ready.
          </p>
        )}
        {exported?.status === "ready" && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {expired
              ? "This export has expired. Request a new copy."
              : `Your export is ready.${exported.expiresAt ? ` Available until ${new Date(exported.expiresAt).toLocaleString("en-US")}.` : ""}`}
          </p>
        )}
        {exported?.status === "ready" && !expired && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {exported.includesOriginalFiles
              ? "Includes your original uploaded files."
              : "Original uploaded files are not included."}
          </p>
        )}
        {exported?.status === "failed" && (
          <p role="status" className="mt-3 text-sm text-destructive">
            Your export could not be prepared. Request a new copy to try again.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!requestExportAction && exported?.status === "ready" && !expired ? (
            <Button
              variant="outline"
              disabled={busy || exportData.loading}
              onClick={() => void exportData.download()}
              className="h-10 rounded-full"
            >
              <Download aria-hidden="true" /> Download export
            </Button>
          ) : preparing && !requestExportAction ? (
            <Button
              variant="outline"
              disabled={busy || exportData.loading}
              onClick={exportData.check}
              className="h-10 rounded-full"
            >
              Check status
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={
                busy ||
                (!requestExportAction &&
                  (preview ||
                    exportData.loading ||
                    (!exportData.known && !requestIds.current.export)))
              }
              onClick={() => {
                if (requestExportAction) void custom(requestExportAction)
                else void exportData.submit(newExport)
              }}
              className="h-10 rounded-full"
            >
              {exportData.pending || customPending ? (
                <Spinner />
              ) : (
                <Download aria-hidden="true" />
              )}
              {unconfirmedExport
                ? "Retry request"
                : newExport
                  ? "Request new export"
                  : "Request export"}
            </Button>
          )}
        </div>
        <RequestError
          error={exportData.error}
          onRetry={exportData.check}
          disabled={busy || exportData.loading}
        />
      </section>
      <section className="pt-6">
        <h3 className="font-medium">Delete account</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This removes your account and study content. Shared links stop
          working. Export anything you want to keep first.
        </p>
        {deletion.loading && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner /> Checking deletion status…
          </p>
        )}
        {deletionPending && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Your deletion request is pending. Account cleanup has not been
            confirmed as complete.
          </p>
        )}
        {deletion.request?.status === "failed" && (
          <p role="status" className="mt-3 text-sm text-destructive">
            Your deletion request could not be completed. You can retry below.
          </p>
        )}
        {deletion.request?.status === "ready" && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Your deletion request is complete.
          </p>
        )}
        {confirmDelete ? (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!busy && canDelete && confirmation === "DELETE") {
                if (requestDeletionAction) void custom(requestDeletionAction)
                else
                  void deletion.submit(
                    !unconfirmedDeletion &&
                      deletion.request?.status === "failed"
                  )
              }
            }}
          >
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="delete-confirm">
                  Type DELETE to confirm
                </FieldLabel>
                <Input
                  id="delete-confirm"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDelete(false)
                    setConfirmation("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={busy || confirmation !== "DELETE" || !canDelete}
                >
                  {deletion.pending || customPending ? <Spinner /> : null}Delete
                  my account
                </Button>
              </div>
            </FieldGroup>
          </form>
        ) : (
          <Button
            variant="destructive"
            disabled={busy || !canDelete}
            onClick={() => setConfirmDelete(true)}
            className="mt-4 h-10 rounded-full"
          >
            <Trash aria-hidden="true" /> Delete account
          </Button>
        )}
        <RequestError
          error={deletion.error}
          onRetry={deletion.check}
          disabled={busy || deletion.loading}
        />
        {preview && (!requestExportAction || !requestDeletionAction) && (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Account export and deletion are available in your signed-in
            workspace.
          </p>
        )}
      </section>
      {customError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{customError}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert role="status" className="mt-4">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </>
  )
}
