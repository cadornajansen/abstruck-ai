import { isProductionRelease, workspaceHref } from "@/lib/release"
import { marketingMetadata } from "@/components/marketing/metadata"
import Link from "next/link"
import { Check } from "iconoir-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
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
  "Study with Abstruck for free. See the available tools and usage allowances.",
  "/pricing"
)

const plans = [
  {
    name: "Free",
    price: "₱0",
    period: "ongoing Free plan",
    description: "Start a study routine with a smaller allowance.",
    features: [
      "Supported study tools",
      "Smaller provisional study allowances",
      "Manual notes and review of saved work",
    ],
    href: "/sign-up",
    action: "Create a free account",
  },
  {
    name: "Paid",
    price: "₱199",
    period: "for 30 days",
    description: "More room for the same study tools.",
    features: [
      "The same supported tools as Free",
      "Higher provisional study allowances",
      "User-initiated QR Ph renewal",
    ],
    href: "/sign-in?next=%2Fbilling",
    action: "View the paid plan",
  },
] as const

export default function PricingPage() {
  const beta = isProductionRelease()
  const availablePlans = beta ? plans.slice(0, 1) : plans
  return (
    <PublicPage
      active="pricing"
      title="Start free. Find your pace."
      description={
        beta
          ? "Bring your materials, understand them, practise and return to review. The public beta is free."
          : "Bring your materials, understand them, practise and return to review. Free and Paid include the same supported tools with different usage allowances."
      }
    >
      {!beta && (
        <Alert className="rounded-2xl">
          <AlertTitle>Development pricing</AlertTitle>
          <AlertDescription>
            Checkout currently uses sandbox/test mode. Public launch and live
            customer payments are pending. Allowances are provisional and
            subject to validation before launch.
          </AlertDescription>
        </Alert>
      )}
      <div className={beta ? "max-w-sm" : "grid gap-5 sm:grid-cols-2"}>
        {availablePlans.map((plan) => (
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
              <Button
                variant={plan.name === "Free" ? "default" : "outline"}
                render={
                  <Link href={workspaceHref(plan.href)} prefetch={false} />
                }
                nativeButton={false}
                className="h-11 w-full rounded-full"
              >
                {plan.action}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      <div className="flex max-w-3xl flex-col gap-7">
        <PublicSection title="Included study tools">
          <p>
            Use supported material imports, study chat, summaries, flashcards,
            quizzes, exams and notes, along with the available visual, practice
            and narrated study formats. Reviewing saved work and manually
            editing notes do not use generation allowance.
          </p>
        </PublicSection>
        <PublicSection title="Allowances being validated">
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
        {!beta && (
          <div id="renewal" className="scroll-mt-28">
            <PublicSection title="Renew when you choose">
              <p>
                Paid access lasts 30 days per verified payment. Each QR Ph
                payment is initiated by you; there is no automatic debit. An
                early renewal adds a future 30-day period after your existing
                paid access.
              </p>
              <p>
                When Paid access ends, the account returns to Free. Saved study
                work remains available, while new uploads are paused if retained
                files exceed the Free storage limit.
              </p>
            </PublicSection>
          </div>
        )}
      </div>
    </PublicPage>
  )
}
