"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NavArrowLeft, Mail } from "iconoir-react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
  SupportInput,
  SupportReceipt,
  SupportResponse,
} from "@/lib/operations-types"
import {
  operationsDate,
  operationsMessage,
  operationsRequest,
} from "./operations-request"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const receiptLabels: Record<SupportReceipt["status"], string> = {
  queued: "Received",
  sending: "Sending",
  sent: "Sent",
  failed: "Could not send",
  uncertain: "Delivery unconfirmed",
}

export function SupportScreen({
  initialRequestId,
  founder,
}: {
  initialRequestId: string | null
  founder: boolean
}) {
  const router = useRouter()
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [referenceKind, setReferenceKind] = useState<"" | "job" | "order">("")
  const [referenceId, setReferenceId] = useState("")
  const [receipt, setReceipt] = useState<SupportReceipt | null>(null)
  const [requestId, setRequestId] = useState(initialRequestId)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [statusError, setStatusError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const inFlight = useRef(false)
  const intent = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const draftFingerprint = JSON.stringify({
    subject: subject.trim(),
    message: message.trim(),
    ...(referenceKind
      ? { reference: { kind: referenceKind, id: referenceId.trim() } }
      : {}),
  })
  const existingIntent =
    receipt?.id === intent.current?.requestId &&
    intent.current?.fingerprint === draftFingerprint
  const unconfirmedIntent =
    Boolean(intent.current) &&
    receipt?.id !== intent.current?.requestId &&
    intent.current?.fingerprint === draftFingerprint

  useEffect(() => setRequestId(initialRequestId), [initialRequestId])

  useEffect(() => {
    if (pending) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let reads = 0
    setLoading(true)
    async function load(): Promise<void> {
      try {
        const result = await operationsRequest<SupportResponse>(
          `/api/support${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ""}`,
          { signal: controller.signal }
        )
        if (controller.signal.aborted) return
        setReceipt(result.request)
        setStatusError("")
        reads += 1
        if (
          result.request &&
          ["queued", "sending"].includes(result.request.status) &&
          reads < 10
        )
          timer = setTimeout(() => void load(), 3000)
      } catch (cause) {
        if (!controller.signal.aborted) setStatusError(operationsMessage(cause))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [requestId, refresh, pending])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (inFlight.current) return
    const cleanSubject = subject.trim()
    const cleanMessage = message.trim()
    const cleanReference = referenceId.trim()
    if (
      !cleanSubject ||
      cleanSubject.length > 120 ||
      cleanMessage.length < 20 ||
      cleanMessage.length > 4000
    ) {
      setError("Enter a subject and a message of 20–4,000 characters.")
      return
    }
    if (referenceKind && !uuid.test(cleanReference)) {
      setError(
        "Enter the full job or payment reference, or choose No reference."
      )
      return
    }
    const content = {
      subject: cleanSubject,
      message: cleanMessage,
      ...(referenceKind
        ? { reference: { kind: referenceKind, id: cleanReference } }
        : {}),
    }
    const fingerprint = JSON.stringify(content)
    if (existingIntent && receipt && receipt.status !== "failed") {
      setRefresh((value) => value + 1)
      return
    }
    if (
      intent.current?.fingerprint !== fingerprint ||
      (existingIntent && receipt?.status === "failed")
    )
      intent.current = { fingerprint, requestId: crypto.randomUUID() }
    inFlight.current = true
    setPending(true)
    setError("")
    setReceipt(null)
    setRequestId(intent.current.requestId)
    try {
      const input: SupportInput = {
        ...content,
        requestId: intent.current.requestId,
      }
      const result = await operationsRequest<SupportResponse>("/api/support", {
        method: "POST",
        body: JSON.stringify(input),
      })
      if (!result.request)
        throw new Error(
          "The request was not confirmed. Your draft is still here; try again."
        )
      setReceipt(result.request)
      setRequestId(result.request.id)
      setRefresh((value) => value + 1)
      router.replace(
        `/support?requestId=${encodeURIComponent(result.request.id)}`,
        { scroll: false }
      )
    } catch (cause) {
      setError(operationsMessage(cause))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="flex h-14 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <NavArrowLeft data-icon="inline-start" /> Back to workspace
        </Button>
        {founder && (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/operations" />}
            nativeButton={false}
          >
            Operations
          </Button>
        )}
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-5 py-10 sm:px-8"
      >
        <div>
          <h1 className="text-3xl font-medium tracking-tight">
            Help &amp; Support
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Tell us what happened and what you expected. Replies go to your
            verified account email.
          </p>
        </div>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Contact support</CardTitle>
            <CardDescription>
              Include an existing job or payment reference when it helps explain
              the problem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void submit(event)}>
              <FieldGroup className="gap-5">
                <Field data-disabled={pending}>
                  <FieldLabel htmlFor="support-subject">Subject</FieldLabel>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    required
                    maxLength={120}
                    disabled={pending}
                  />
                </Field>
                <Field data-disabled={pending}>
                  <FieldLabel htmlFor="support-message">Message</FieldLabel>
                  <Textarea
                    id="support-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    required
                    minLength={20}
                    maxLength={4000}
                    rows={7}
                    disabled={pending}
                  />
                  <FieldDescription>20–4,000 characters.</FieldDescription>
                </Field>
                <Field data-disabled={pending}>
                  <FieldLabel htmlFor="support-reference-kind">
                    Reference (optional)
                  </FieldLabel>
                  <NativeSelect
                    id="support-reference-kind"
                    value={referenceKind}
                    onChange={(event) =>
                      setReferenceKind(
                        event.target.value as "" | "job" | "order"
                      )
                    }
                    disabled={pending}
                    className="w-full"
                  >
                    <NativeSelectOption value="">
                      No reference
                    </NativeSelectOption>
                    <NativeSelectOption value="job">
                      Processing job
                    </NativeSelectOption>
                    <NativeSelectOption value="order">
                      Payment order
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                {referenceKind && (
                  <Field data-disabled={pending}>
                    <FieldLabel htmlFor="support-reference">
                      {referenceKind === "job" ? "Job" : "Payment"} reference
                    </FieldLabel>
                    <Input
                      id="support-reference"
                      value={referenceId}
                      onChange={(event) => setReferenceId(event.target.value)}
                      required
                      maxLength={36}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={pending}
                    />
                  </Field>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error} Your draft has been kept.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    disabled={
                      pending || !subject.trim() || message.trim().length < 20
                    }
                  >
                    {pending ? <Spinner /> : <Mail data-icon="inline-start" />}{" "}
                    {pending
                      ? "Sending request…"
                      : unconfirmedIntent
                        ? "Retry request"
                        : existingIntent && receipt?.status !== "failed"
                          ? "Check request status"
                          : receipt?.status === "failed"
                            ? "Send a new request"
                            : "Send request"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Up to 5 requests per 24 hours.
                  </p>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
        <section
          aria-labelledby="support-status-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="support-status-heading" className="text-lg font-medium">
              Request status
            </h2>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || pending}
              onClick={() => setRefresh((value) => value + 1)}
            >
              {loading && <Spinner />}Check status
            </Button>
          </div>
          {statusError && (
            <Alert variant="destructive">
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          )}
          {receipt ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Support request</CardTitle>
                  <Badge
                    variant={
                      receipt.status === "failed" ? "destructive" : "outline"
                    }
                  >
                    {receiptLabels[receipt.status]}
                  </Badge>
                </div>
                <CardDescription>
                  Received {operationsDate(receipt.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs break-all text-muted-foreground">
                  Reference: {receipt.id}
                </p>
                <p role="status" className="text-sm leading-6">
                  {receipt.status === "sent"
                    ? `Sent to support${receipt.sentAt ? ` on ${operationsDate(receipt.sentAt)}` : ""}.`
                    : receipt.status === "uncertain"
                      ? "Delivery has not been confirmed. Check this request’s status before sending another."
                      : receipt.status === "failed"
                        ? "This request could not be delivered. Check its status, or deliberately send a new request."
                        : "Your request was received and is waiting to be delivered."}
                </p>
              </CardContent>
            </Card>
          ) : loading || pending ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner />
              {pending
                ? "Submitting your request…"
                : "Loading your latest request…"}
            </p>
          ) : !statusError ? (
            <p className="text-sm text-muted-foreground">
              No support request yet.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  )
}
