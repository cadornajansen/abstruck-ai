"use client"

import { useState } from "react"
import { Check, CheckCircle, Clock, WarningTriangle } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@workspace/ui/components/table"

export type BillingState =
  | "free"
  | "paid"
  | "quota"
  | "pending"
  | "delayed"
  | "confirmed"
  | "renewed"
  | "expired"
  | "failed"
  | "refunded"
const paymentCopy = {
  pending: {
    title: "Checking your payment",
    text: "Your payment has not been confirmed yet. You can keep studying while we check.",
    icon: Clock,
  },
  delayed: {
    title: "Confirmation is taking longer",
    text: "If you already paid, please don’t pay again. Check your payment history or contact support with the order reference.",
    icon: Clock,
  },
  confirmed: {
    title: "Your paid plan is active",
    text: "Your payment was confirmed. Your current study period is ready to use.",
    icon: CheckCircle,
  },
  renewed: {
    title: "Your next study period is ready",
    text: "Your renewal starts when your current paid period ends. Your current allowance has not reset early.",
    icon: CheckCircle,
  },
  expired: {
    title: "This payment request has expired",
    text: "If you have not paid, create a fresh payment request. If money was deducted, contact support before trying again.",
    icon: WarningTriangle,
  },
  failed: {
    title: "We couldn’t complete this payment",
    text: "Your existing plan is unchanged. Try again, or contact support if you were charged.",
    icon: WarningTriangle,
  },
  refunded: {
    title: "This payment was refunded",
    text: "Access from this payment has ended. Your saved study content remains available.",
    icon: CheckCircle,
  },
} as const

const allowanceRows = [
  { label: "Stored files", used: 42, free: 100, paid: 2000, unit: "MB" },
  {
    label: "Imported document pages",
    used: 20,
    free: 50,
    paid: 1000,
    unit: "pages",
  },
  { label: "Transcription", used: 4, free: 10, paid: 300, unit: "minutes" },
  { label: "OCR pages", used: 2, free: 5, paid: 100, unit: "pages" },
  { label: "Chat messages", used: 8, free: 20, paid: 500, unit: "messages" },
  { label: "Generated study sets", used: 1, free: 3, paid: 100, unit: "sets" },
] as const

export function BillingPreview({ state }: { state: BillingState }) {
  const [checkout, setCheckout] = useState(false)
  const [notice, setNotice] = useState("")
  const paid = ["paid", "confirmed", "renewed"].includes(state)
  const payment =
    state in paymentCopy ? paymentCopy[state as keyof typeof paymentCopy] : null
  const PaymentIcon = payment?.icon

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-6 py-10 lg:px-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">
            Plans and usage
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Keep track of your study allowance and your next renewal.
          </p>
        </div>
        <Badge variant="outline" className="h-7 px-3">
          {paid ? "Paid Plan" : "Free Plan"}
        </Badge>
      </div>
      {payment && PaymentIcon && (
        <Alert className="mt-7 rounded-2xl">
          <PaymentIcon />
          <AlertTitle>{payment.title}</AlertTitle>
          <AlertDescription>
            {payment.text}
            <span className="mt-2 block text-xs">
              Synthetic order: PREVIEW-001 · No real payment is represented.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {state === "quota" && (
        <Alert className="mt-7 rounded-2xl">
          <WarningTriangle />
          <AlertTitle>You’ve used your chat allowance</AlertTitle>
          <AlertDescription>
            Your saved materials, notes and flashcards are still available. You
            can wait for your next period or choose a plan with more allowance.
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {[
          {
            name: "Free",
            price: "₱0",
            period: "ongoing",
            features: [
              "Every study tool",
              "A smaller allowance to get started",
              "Keep and review saved work",
            ],
          },
          {
            name: "Paid Plan",
            price: "₱199",
            period: "per 30 days",
            features: [
              "Every study tool",
              "Higher study allowances",
              "Customer-initiated QR Ph renewal",
            ],
          },
        ].map((plan, index) => (
          <Card key={plan.name} className="rounded-3xl py-6">
            <CardHeader>
              <CardTitle className="text-lg">{plan.name}</CardTitle>
              <CardDescription>
                {index === 0
                  ? "A starting place for your study routine."
                  : "More room for everyday study."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>
                <strong className="text-3xl font-medium">{plan.price}</strong>
                <span className="ml-2 text-sm text-muted-foreground">
                  {plan.period}
                </span>
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <Check className="size-4 shrink-0 text-plan-foreground" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={index === 0 ? "outline" : "default"}
                className="mt-6 w-full rounded-xl"
                disabled={index === 0}
                onClick={() => setCheckout(true)}
              >
                {index === 0
                  ? paid
                    ? "Available when paid access expires"
                    : "Current plan"
                  : paid
                    ? "Renew for 30 days"
                    : "Upgrade"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        No automatic debit. Each renewal is a new payment you choose to make.
        Early renewal preserves the time remaining in your current paid period.
      </p>
      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Your allowance</h2>
          <span className="text-xs text-muted-foreground">
            Illustrative 30-day period
          </span>
        </div>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          Development figures below use provisional cost-test limits. They are
          not published plan promises or live usage.
        </p>
        <div className="mt-5 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {allowanceRows.map((row) => {
            const limit = paid ? row.paid : row.free
            const used =
              state === "quota" && row.label === "Chat messages"
                ? limit
                : row.used
            return (
              <div key={row.label}>
                <div className="mb-3 flex justify-between gap-3 text-sm">
                  <span>{row.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {used} / {limit} {row.unit}
                  </span>
                </div>
                <Progress
                  value={(used / limit) * 100}
                  aria-label={`${row.label} usage`}
                />
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          Storage is your current total. OCR pages also count toward imported
          pages. Viewing saved work and manually editing notes do not spend
          AI-generation allowance.
        </p>
      </section>
      <section className="mt-12">
        <h2 className="text-xl">Payment history</h2>
        <div className="mt-5 rounded-2xl border p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state === "free" || state === "quota" ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-9 text-center text-muted-foreground"
                  >
                    No payments in this sample state.
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell>PREVIEW-001</TableCell>
                  <TableCell>₱199</TableCell>
                  <TableCell className="capitalize">
                    {state === "paid" ? "confirmed" : state}
                  </TableCell>
                  <TableCell>30 days</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <Button
          variant="ghost"
          className="mt-3"
          onClick={() =>
            setNotice(
              "Support preview: include only the order reference when asking for help. No support request was sent."
            )
          }
        >
          Need help with a payment?
        </Button>
      </section>
      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {paid ? "Renew your paid plan" : "Upgrade your study plan"}
            </DialogTitle>
            <DialogDescription>
              ₱199 for 30 days. Pay with QR Ph through hosted checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl bg-muted/50 p-4 text-sm leading-6">
            <p>
              {paid
                ? "The next period begins after your current paid access expires."
                : "Your paid period begins after payment is confirmed."}
            </p>
            <p className="mt-2">
              Returning from checkout does not confirm payment. You’ll see a
              pending status until confirmation arrives.
            </p>
          </div>
          <Alert>
            <AlertTitle>Checkout is not connected in this preview</AlertTitle>
            <AlertDescription>
              No payment order will be created and you will not be charged.
            </AlertDescription>
          </Alert>
          <Button disabled className="h-11 rounded-xl">
            Continue to QR Ph checkout
          </Button>
          <Button variant="ghost" onClick={() => setCheckout(false)}>
            Back to plans
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  )
}
