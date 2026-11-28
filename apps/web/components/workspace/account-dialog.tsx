"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Circle,
  CreditCard,
  User,
  Settings,
  Database,
  EditPencil,
  Xmark,
} from "iconoir-react"
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { BillingSettingsPanel, type BillingUsageState } from "./billing-usage"
import {
  AccountDataControls,
  type AccountDataRequestIds,
} from "./account-data-controls"

export interface AccountProfile {
  name: string
  email?: string
  school?: string
  course?: string
  createdAt?: string
  contentCount?: number
}

type AccountResult = { error?: string; message?: string }

export interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: AccountProfile
  billing: BillingUsageState
  initialTab?: "account" | "billing"
  returnedFromCheckout?: boolean
  preview?: boolean
  saveProfileAction?: (formData: FormData) => Promise<AccountResult>
  requestExportAction?: () => Promise<AccountResult>
  requestDeletionAction?: () => Promise<AccountResult>
}

export function AccountDialog({
  open,
  onOpenChange,
  profile,
  billing,
  initialTab = "account",
  returnedFromCheckout = false,
  preview = false,
  saveProfileAction,
  requestExportAction,
  requestDeletionAction,
}: AccountDialogProps) {
  const router = useRouter()
  const [account, setAccount] = useState(profile)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState(false)
  const [completeProfile, setCompleteProfile] = useState(false)
  const [tab, setTab] = useState<string>(initialTab)
  const [dataPending, setDataPending] = useState(false)
  const dataRequestIds = useRef<AccountDataRequestIds>({
    export: null,
    deletion: null,
  })

  useEffect(() => {
    if (!open || preview) return
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch("/api/account/profile", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.error ?? "Your profile could not be loaded.")
        if (!controller.signal.aborted) setAccount(result.profile)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your profile could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, preview, retry])

  async function perform(action: () => Promise<AccountResult>) {
    setPending(true)
    setError("")
    setMessage("")
    try {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return false
      }
      if (result.message) setMessage(result.message)
      return true
    } catch {
      setError("Your request couldn’t be completed. Please try again.")
      return false
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("display_name") ?? account.name).trim()
    const school = String(formData.get("school") ?? account.school ?? "").trim()
    const course = String(formData.get("course") ?? account.course ?? "").trim()
    if (!name) {
      setError("Enter your name before saving.")
      return
    }
    const success = await perform(async () => {
      if (saveProfileAction) return saveProfileAction(formData)
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, school, course }),
      })
      const result = await response.json()
      if (!response.ok)
        return { error: result.error ?? "Your profile could not be saved." }
      setAccount(result.profile)
      return { message: "Profile updated." }
    })
    if (success) {
      setEditing(false)
      setCompleteProfile(false)
      if (!preview) router.refresh()
    }
  }

  const canEdit = !preview || !!saveProfileAction

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending && !dataPending) {
          onOpenChange(next)
          if (!next) {
            setEditing(false)
            setCompleteProfile(false)
            setMessage("")
            setTab("account")
          }
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(600px,calc(100svh-2rem))] w-[calc(100%-2rem)] max-w-3xl! flex-col gap-0 overflow-hidden rounded-[12px] p-0 data-[nested-dialog-open]:brightness-75"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your profile, plan, personalization and account data.
          </DialogDescription>
        </DialogHeader>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 sm:right-auto sm:left-2"
              disabled={pending || dataPending}
            />
          }
        >
          <Xmark aria-hidden="true" />
          <span className="sr-only">Close settings</span>
        </DialogClose>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(String(value))}
          className="grid! min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-0 sm:grid-cols-[192px_minmax(0,1fr)] sm:grid-rows-1"
        >
          <TabsList className="h-auto! w-[calc(100%-2.5rem)] shrink-0 items-start! justify-start gap-1 overflow-x-auto rounded-none border-b bg-muted/40 p-3 sm:w-full sm:flex-col sm:border-r sm:border-b-0 sm:p-4 sm:pt-12">
            <TabsTrigger
              value="account"
              className="h-9 flex-none justify-start rounded-md px-3 sm:w-full"
            >
              <User aria-hidden="true" />
              Account
            </TabsTrigger>
            <TabsTrigger
              value="preferences"
              className="h-9 flex-none justify-start rounded-md px-3 sm:w-full"
            >
              <Settings aria-hidden="true" />
              Personalization
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="h-9 flex-none justify-start rounded-md px-3 sm:w-full"
            >
              <CreditCard aria-hidden="true" />
              Plan &amp; Billing
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="h-9 flex-none justify-start rounded-md px-3 sm:w-full"
            >
              <Database aria-hidden="true" />
              Data controls
            </TabsTrigger>
          </TabsList>
          <div className="min-h-0 min-w-0 overflow-y-auto p-5 sm:p-6">
            <TabsContent value="account" className="min-w-0">
              <h2 className="sr-only">Account</h2>
              <Alert
                role="region"
                aria-label="Complete profile"
                className="mb-4 flex min-h-16 items-center gap-3 rounded-[16px] border-info-border bg-info p-3 text-info-foreground"
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-info-accent/20 bg-info-accent/10 text-info-accent"
                  aria-hidden="true"
                >
                  <Circle className="size-7" strokeDasharray="3 3" />
                </div>
                <div className="min-w-0 flex-1">
                  <AlertTitle className="text-sm leading-5">
                    Complete Profile
                  </AlertTitle>
                  <AlertDescription className="mt-0.5 text-xs leading-4 text-info-accent">
                    Get personalized contents
                  </AlertDescription>
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-10 rounded-[12px] border-info-border bg-transparent px-3 text-info-accent hover:bg-info-accent/5 hover:text-info-accent"
                  disabled={!canEdit || loading || pending}
                  aria-expanded={completeProfile}
                  aria-controls="account-profile-details"
                  onClick={() => {
                    setCompleteProfile(!completeProfile)
                    setEditing(false)
                    setError("")
                    setMessage("")
                  }}
                >
                  Complete
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              </Alert>
              {loading ? (
                <div
                  role="status"
                  aria-label="Loading account"
                  className="flex flex-col gap-6 py-3"
                >
                  {[0, 1, 2, 3].map((row) => (
                    <Skeleton key={row} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <dl className="divide-y text-sm leading-5">
                    <div className="flex min-h-13 items-center justify-between gap-4 py-3">
                      <dt className="shrink-0">Name</dt>
                      <dd className="min-w-0">
                        {editing ? (
                          <form
                            onSubmit={save}
                            className="flex flex-wrap items-center justify-end gap-2"
                          >
                            <Input
                              autoFocus
                              name="display_name"
                              aria-label="Name"
                              defaultValue={account.name}
                              maxLength={100}
                              required
                              disabled={pending}
                              className="h-9 min-w-0 flex-1"
                            />
                            <Button type="submit" size="sm" disabled={pending}>
                              {pending ? <Spinner /> : "Save"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => setEditing(false)}
                            >
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-right break-words text-muted-foreground">
                              {account.name || "Not added"}
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Edit name"
                                onClick={() => {
                                  setEditing(true)
                                  setError("")
                                  setMessage("")
                                }}
                              >
                                <EditPencil aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="shrink-0">Email</dt>
                      <dd className="text-right break-all text-muted-foreground">
                        {account.email || "Not available"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="shrink-0">Created at</dt>
                      <dd className="text-right text-muted-foreground">
                        {account.createdAt
                          ? new Date(account.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )
                          : "Not available"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <dt className="shrink-0">Content count</dt>
                      <dd className="text-right text-muted-foreground">
                        {account.contentCount ?? "Not available"}
                      </dd>
                    </div>
                  </dl>
                  {completeProfile && (
                    <form
                      id="account-profile-details"
                      onSubmit={save}
                      className="mt-5"
                    >
                      <FieldGroup className="gap-4">
                        <Field>
                          <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                          <Input
                            id="profile-name"
                            name="display_name"
                            defaultValue={account.name}
                            maxLength={100}
                            required
                            disabled={pending}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="profile-school">
                            School (optional)
                          </FieldLabel>
                          <Input
                            id="profile-school"
                            name="school"
                            defaultValue={account.school}
                            maxLength={100}
                            disabled={pending}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="profile-course">
                            Course (optional)
                          </FieldLabel>
                          <Input
                            id="profile-course"
                            name="course"
                            defaultValue={account.course}
                            maxLength={100}
                            disabled={pending}
                          />
                        </Field>
                        <Button
                          type="submit"
                          className="w-fit rounded-full"
                          disabled={pending}
                        >
                          {pending && <Spinner />}Save profile
                        </Button>
                      </FieldGroup>
                    </form>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent value="preferences">
              <h2 className="mb-5 text-xl font-medium">Personalization</h2>
              <dl className="divide-y text-sm">
                <div className="flex justify-between gap-4 py-4">
                  <dt>Interface language</dt>
                  <dd className="text-muted-foreground">English</dd>
                </div>
                <div className="flex justify-between gap-4 py-4">
                  <dt>Appearance</dt>
                  <dd className="text-muted-foreground">Light</dd>
                </div>
              </dl>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                Choose Fast Review or Spaced Repetition when you open a
                flashcard deck.
              </p>
            </TabsContent>
            <TabsContent value="billing">
              <h2 className="sr-only">Plan &amp; Billing</h2>
              <BillingSettingsPanel
                preview={preview}
                billing={billing}
                returnedFromCheckout={returnedFromCheckout}
              />
            </TabsContent>
            <TabsContent value="data" keepMounted>
              <h2 className="mb-5 text-xl font-medium">Data controls</h2>
              <AccountDataControls
                active={open && tab === "data"}
                preview={preview}
                disabled={pending}
                requestIds={dataRequestIds}
                onPendingChange={setDataPending}
                requestExportAction={requestExportAction}
                requestDeletionAction={requestDeletionAction}
              />
            </TabsContent>
            {error && (
              <Alert variant="destructive" className="mt-5">
                <AlertDescription>
                  {error}
                  {!editing && !completeProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-fit"
                      onClick={() => setRetry((value) => value + 1)}
                    >
                      Retry
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert role="status" className="mt-5">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
