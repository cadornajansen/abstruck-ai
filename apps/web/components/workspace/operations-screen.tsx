"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { NavArrowLeft, Refresh } from "iconoir-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { checkoutReferenceSchema } from "@/lib/operations-types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import type {
  OperationsJob,
  OperationsOverview,
  OperationsPayment,
} from "@/lib/operations-types"
import {
  OperationsRequestError,
  operationsDate,
  operationsMessage,
  operationsRequest,
} from "./operations-request"

type RecoveryAction =
  | { type: "retry"; job: OperationsJob }
  | { type: "reconcile"; payment: OperationsPayment }

function stateLabel(value: string): string {
  return value.replaceAll("_", " ")
}

function State({ value }: { value: string }) {
  return (
    <Badge
      variant={value === "failed" ? "destructive" : "outline"}
      className="capitalize"
    >
      {stateLabel(value)}
    </Badge>
  )
}

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value)
}

function Reference({ value }: { value: string }) {
  return (
    <code className="block text-xs break-all text-muted-foreground">
      {value}
    </code>
  )
}

export function OperationsScreen() {
  const [overview, setOverview] = useState<OperationsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const requestIds = useRef(new Map<string, string>())
  const [actionError, setActionError] = useState("")
  const [checkoutReferences, setCheckoutReferences] = useState<
    Record<string, string>
  >({})
  const [feedback, setFeedback] = useState<{
    message: string
    auditId: string
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void operationsRequest<{ overview: OperationsOverview }>(
      "/api/operations",
      { signal: controller.signal }
    )
      .then((result) => {
        if (controller.signal.aborted) return
        setOverview(result.overview)
        setError("")
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (
          cause instanceof OperationsRequestError &&
          [401, 403].includes(cause.status)
        )
          setOverview(null)
        setError(operationsMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  async function recover(action: RecoveryAction): Promise<void> {
    if (pendingRef.current || loading || error) return
    if (action.type === "retry" && !action.job.retryAllowed) return
    if (
      action.type === "reconcile" &&
      (!action.payment.testMode ||
        (!action.payment.reconcileAllowed &&
          !["creating", "review"].includes(action.payment.state)))
    )
      return
    const id = action.type === "retry" ? action.job.id : action.payment.id
    const checkoutId =
      action.type === "reconcile" ? checkoutReferences[id]?.trim() : undefined
    if (
      action.type === "reconcile" &&
      !action.payment.reconcileAllowed &&
      !checkoutReferenceSchema.safeParse(checkoutId).success
    ) {
      setActionError(
        "Enter the original checkout ID from PayMongo before recovering this order."
      )
      return
    }
    const version =
      action.type === "retry"
        ? `${action.job.attempt}:${action.job.updatedAt}`
        : action.payment.updatedAt
    const key = `${action.type}:${id}:${version}`
    const requestId = requestIds.current.get(key) ?? crypto.randomUUID()
    requestIds.current.set(key, requestId)
    pendingRef.current = true
    setPending(key)
    setActionError("")
    setFeedback(null)
    try {
      const result = await operationsRequest<{
        state: string
        auditId: string
      }>(
        `/api/operations/${action.type === "retry" ? "jobs" : "payments"}/${id}/${action.type}`,
        {
          method: "POST",
          body: JSON.stringify({
            requestId,
            ...(checkoutId ? { checkoutId } : {}),
          }),
        }
      )
      requestIds.current.delete(key)
      setFeedback({
        message: `${action.type === "retry" ? "Retry accepted" : "Sandbox reconciliation completed"}. Saved state: ${stateLabel(result.state)}.`,
        auditId: result.auditId,
      })
    } catch (cause) {
      if (cause instanceof OperationsRequestError) {
        if (cause.status === 409) requestIds.current.delete(key)
        if ([401, 403].includes(cause.status)) setOverview(null)
      }
      setActionError(operationsMessage(cause))
    } finally {
      pendingRef.current = false
      setPending(null)
      setLoading(true)
      setReload((value) => value + 1)
    }
  }

  const disabled = loading || Boolean(pending) || Boolean(error)
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
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/support" />}
          nativeButton={false}
        >
          Support
        </Button>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-10 sm:px-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Operations</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Founder access · job recovery, sandbox payments and recorded
              usage.
            </p>
            {overview && (
              <p className="mt-2 text-xs text-muted-foreground">
                Snapshot {operationsDate(overview.generatedAt)}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={loading || Boolean(pending)}
            onClick={() => setReload((value) => value + 1)}
          >
            {loading ? <Spinner /> : <Refresh data-icon="inline-start" />}
            Refresh
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Operations could not be refreshed</AlertTitle>
            <AlertDescription>
              {error}
              {overview &&
                " Showing the last loaded snapshot; recovery actions are paused until refresh succeeds."}
            </AlertDescription>
          </Alert>
        )}
        {actionError && (
          <Alert variant="destructive">
            <AlertTitle>Action not confirmed</AlertTitle>
            <AlertDescription>
              {actionError} Refresh the snapshot before another attempt.
            </AlertDescription>
          </Alert>
        )}
        {feedback && (
          <Alert role="status">
            <AlertDescription>
              {feedback.message}
              <span className="mt-2 block text-xs break-all">
                Audit reference: {feedback.auditId}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {loading && !overview && (
          <div
            role="status"
            aria-label="Loading operations"
            className="flex flex-col gap-5"
          >
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        )}
        {overview && (
          <>
            <dl className="grid grid-cols-2 gap-5 rounded-2xl border border-border/60 bg-card p-5 sm:grid-cols-4">
              {(["queued", "running", "waiting", "failed"] as const).map(
                (state) => (
                  <div key={state}>
                    <dt className="text-xs text-muted-foreground capitalize">
                      {state} jobs
                    </dt>
                    <dd className="mt-2 text-2xl font-medium">
                      {overview.jobCounts[state].toLocaleString()}
                    </dd>
                  </div>
                )
              )}
            </dl>
            <Tabs defaultValue="jobs" className="min-w-0 gap-5">
              <TabsList className="max-w-full overflow-x-auto">
                <TabsTrigger value="jobs">Jobs</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="costs">Costs &amp; services</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>
              <TabsContent value="jobs" className="min-w-0">
                <h2 className="mb-3 text-lg font-medium">Recent jobs</h2>
                <div className="overflow-hidden rounded-2xl border border-border/60">
                  <Table
                    className="min-w-[760px]"
                    aria-label="Recent processing jobs"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Attempt</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Recovery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.jobs.length ? (
                        overview.jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="max-w-72">
                              <p className="mb-1 font-medium capitalize">
                                {stateLabel(job.kind)}
                              </p>
                              <Reference value={job.id} />
                              <p className="mt-1 text-xs text-muted-foreground">
                                {job.targetKind} {job.targetId.slice(0, 8)} ·
                                owner {job.ownerId.slice(0, 8)}
                              </p>
                              {job.errorCode && (
                                <p className="mt-1 text-xs break-words text-muted-foreground">
                                  {job.errorCode}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <State value={job.state} />
                              {job.leaseUntil && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Lease until {operationsDate(job.leaseUntil)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>{job.attempt}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {operationsDate(job.updatedAt)}
                            </TableCell>
                            <TableCell className="max-w-64">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={disabled || !job.retryAllowed}
                                aria-label={`Retry job ${job.id}`}
                                onClick={() =>
                                  void recover({ type: "retry", job })
                                }
                              >
                                {pending?.startsWith(`retry:${job.id}:`) && (
                                  <Spinner />
                                )}
                                Retry failed job
                              </Button>
                              {!job.retryAllowed && job.retryReason && (
                                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                                  {job.retryReason}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No jobs in this snapshot.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="payments" className="min-w-0">
                <div className="mb-4">
                  <h2 className="text-lg font-medium">
                    Payment reconciliation
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sandbox orders only. Reconciliation checks the payment
                    state; it does not create a charge.
                  </p>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/60">
                  <Table
                    className="min-w-[680px]"
                    aria-label="Payment reconciliation queue"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.payments.length ? (
                        overview.payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <Reference value={payment.id} />
                              <p className="mt-1 text-xs text-muted-foreground">
                                Owner {payment.ownerId.slice(0, 8)} ·{" "}
                                {payment.testMode ? "Sandbox" : "Live"}
                              </p>
                              {payment.errorCode && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {payment.errorCode}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <State value={payment.state} />
                            </TableCell>
                            <TableCell>
                              {new Intl.NumberFormat("en-PH", {
                                style: "currency",
                                currency: payment.currency,
                              }).format(payment.amount / 100)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {operationsDate(payment.updatedAt)}
                            </TableCell>
                            <TableCell>
                              {!payment.reconcileAllowed &&
                                ["creating", "review"].includes(
                                  payment.state
                                ) && (
                                  <Field className="mb-2 min-w-56">
                                    <FieldLabel
                                      htmlFor={`checkout-${payment.id}`}
                                      className="text-xs"
                                    >
                                      Original PayMongo checkout ID
                                    </FieldLabel>
                                    <Input
                                      id={`checkout-${payment.id}`}
                                      value={
                                        checkoutReferences[payment.id] ?? ""
                                      }
                                      placeholder="cs_…"
                                      disabled={disabled}
                                      onChange={(event) =>
                                        setCheckoutReferences((values) => ({
                                          ...values,
                                          [payment.id]: event.target.value,
                                        }))
                                      }
                                    />
                                  </Field>
                                )}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  disabled ||
                                  !payment.testMode ||
                                  (!payment.reconcileAllowed &&
                                    (!["creating", "review"].includes(
                                      payment.state
                                    ) ||
                                      !checkoutReferenceSchema.safeParse(
                                        checkoutReferences[payment.id]
                                      ).success))
                                }
                                aria-label={`Reconcile sandbox order ${payment.id}`}
                                onClick={() =>
                                  void recover({ type: "reconcile", payment })
                                }
                              >
                                {pending?.startsWith(
                                  `reconcile:${payment.id}:`
                                ) && <Spinner />}
                                Reconcile sandbox
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No payment orders in this snapshot.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="costs" className="flex flex-col gap-6">
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>
                      Costs · last {overview.costs.windowHours} hours
                    </CardTitle>
                    <CardDescription>
                      Recorded provider usage and reserved amounts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-6">
                    <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Actual cost
                        </dt>
                        <dd className="mt-2 font-medium">
                          {usd(overview.costs.actualUsd)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Reserved
                        </dt>
                        <dd className="mt-2 font-medium">
                          {usd(overview.costs.reservedUsd)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Input tokens
                        </dt>
                        <dd className="mt-2 font-medium">
                          {overview.costs.inputTokens.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Output tokens
                        </dt>
                        <dd className="mt-2 font-medium">
                          {overview.costs.outputTokens.toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                    <Table aria-label="Costs by feature">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Feature</TableHead>
                          <TableHead>Requests</TableHead>
                          <TableHead>Actual USD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {overview.costs.byFeature.length ? (
                          overview.costs.byFeature.map((feature) => (
                            <TableRow key={feature.feature}>
                              <TableCell className="capitalize">
                                {stateLabel(feature.feature)}
                              </TableCell>
                              <TableCell>
                                {feature.requests.toLocaleString()}
                              </TableCell>
                              <TableCell>{usd(feature.actualUsd)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="py-6 text-center text-muted-foreground"
                            >
                              No recorded feature cost in this window.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl">
                  <CardHeader>
                    <CardTitle>Service status</CardTitle>
                    <CardDescription>
                      Reported configuration and availability checks.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {overview.services.map((service) => (
                        <li
                          key={service.name}
                          className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {service.name}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {service.detail}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {service.state === "unknown"
                              ? "Not checked"
                              : stateLabel(service.state)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    {!overview.services.length && (
                      <p className="text-sm text-muted-foreground">
                        No service status is available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="audit" className="min-w-0">
                <h2 className="mb-3 text-lg font-medium">
                  Recent recovery actions
                </h2>
                <div className="overflow-hidden rounded-2xl border border-border/60">
                  <Table
                    className="min-w-[680px]"
                    aria-label="Operations audit"
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Audit reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.audit.length ? (
                        overview.audit.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {operationsDate(entry.createdAt)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {stateLabel(entry.action)}
                              {entry.actorId && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Actor {entry.actorId.slice(0, 8)}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <p className="mb-1 text-xs">{entry.targetType}</p>
                              <Reference value={entry.targetId} />
                            </TableCell>
                            <TableCell>
                              <State value={entry.status} />
                              {entry.errorCode && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {entry.errorCode}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Reference value={entry.id} />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="py-10 text-center text-muted-foreground"
                          >
                            No recovery action has been recorded.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  )
}
