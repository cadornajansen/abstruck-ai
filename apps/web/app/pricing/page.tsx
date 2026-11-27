import { isPolarBillingConfigured } from "@/lib/polar-config"
import { workspaceHref } from "@/lib/release"
import { marketingMetadata } from "@/components/marketing/metadata"
import Link from "next/link"
import { Check } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PublicPage, PublicSection } from "@/components/public-page"

export const metadata = marketingMetadata(
  "Pricing",
  "Compare Free and Pro study allowances. Pro includes 10 hours of media processing, 500 document pages, and 300 study-chat questions each month.",
  "/pricing"
)

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "per month",
    description: "For trying out the workspace.",
    features: [
      "10 minutes of media processing",
      "50 document pages",
      "20 study-chat questions per allowance period",
    ],
    href: "/sign-up",
    action: "Create a free account",
  },
  {
    name: "Pro",
    price: "US$6.99",
    period: "or ₱199 per month",
    description: "For regular coursework and longer recordings.",
    features: [
      "10 hours of media processing",
      "500 document pages",
      "300 study-chat questions per month",
    ],
    href: "/billing",
    action: "Choose Pro",
  },
] as const

export default function PricingPage() {
  const checkoutAvailable = isPolarBillingConfigured()
  return (
    <PublicPage
      active="pricing"
      title="Start free. Find your pace."
      description="Start with Free or choose Pro for a larger monthly allowance."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className="rounded-3xl py-8 shadow-none [--card-spacing:--spacing(8)]"
          >
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <p>
                <span className="text-4xl font-medium tracking-tight">
                  {plan.price}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {plan.period}
                </span>
              </p>
              <ul className="flex flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="mt-auto border-0 bg-transparent pt-0">
              {plan.name === "Pro" && !checkoutAvailable ? (
                <Button
                  disabled
                  variant="outline"
                  className="h-11 w-full rounded-full"
                >
                  Checkout unavailable
                </Button>
              ) : (
                <Button
                  variant={plan.name === "Free" ? "outline" : "default"}
                  render={
                    <Link href={workspaceHref(plan.href)} prefetch={false} />
                  }
                  nativeButton={false}
                  className="h-11 w-full rounded-full"
                >
                  {plan.action}
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="flex max-w-3xl flex-col gap-7">
        <PublicSection title="Included study tools">
          <p>
            Import course materials, ask questions with citations, and review
            with notes, flashcards, quizzes or AI-narrated slides. Reviewing
            saved work and editing notes by hand use no generation allowance.
          </p>
        </PublicSection>
        <PublicSection title="Tracking your usage">
          <p>
            Usage limits cover stored files, imported document pages,
            transcription, scanned-page extraction, chat messages and generated
            study sets. Processing concurrency is also limited.
          </p>
          <p>
            View current limits, remaining usage and period dates in Settings →
            Plan &amp; Billing after signing in.
          </p>
        </PublicSection>
        <div id="renewal" className="scroll-mt-28">
          <PublicSection title="Managing your subscription">
            <p>
              Pro renews monthly through Polar. Choose US dollars or Philippine
              pesos at checkout. You can view invoices, update your payment
              method and cancel from Plan &amp; Billing.
            </p>
            <p>
              If you cancel, you can use Pro through the end of your paid
              period. Your account then returns to Free. You can keep reviewing
              saved work. New uploads pause if your files exceed the Free
              storage limit.
            </p>
          </PublicSection>
        </div>
      </div>
    </PublicPage>
  )
}
