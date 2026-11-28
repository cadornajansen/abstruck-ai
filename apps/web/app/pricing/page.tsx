import { headers } from "next/headers"
import Link from "next/link"
import { Check, Plus } from "iconoir-react"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { marketingMetadata } from "@/components/marketing/metadata"
import { getCurrentUser } from "@/lib/auth/session"
import { isPolarBillingConfigured } from "@/lib/polar-config"
import { getPricingCurrency, monthlyPrices, proFeatures } from "@/lib/pricing"
import { workspaceHref } from "@/lib/release"

export const metadata = marketingMetadata(
  "Pricing",
  "Compare Free and Pro study allowances. Pro includes 10 hours of media processing, 500 document pages, and 300 study-chat questions each month.",
  "/pricing"
)

const plans = [
  {
    id: "pro",
    name: "Pro",
    description: "For daily lectures and exam prep.",
    features: proFeatures,
    href: "/billing?upgrade=pro",
    action: "View Pro plan",
  },
  {
    id: "free",
    name: "Free",
    description: "For notes and short recordings.",
    features: [
      "10 minutes of audio and video",
      "50 document pages",
      "20 study-chat questions",
      "3 generated study sets",
      "100 MB of file storage",
    ],
    href: "/sign-up",
    action: "Start free",
  },
] as const

const planDetails = [
  {
    id: "tools",
    question: "Which study tools are included?",
    answer:
      "Both plans let you import course materials, ask questions with citations, and make notes, flashcards, quizzes, and AI-narrated slides. Reviewing saved work and editing notes by hand use no generation allowance.",
  },
  {
    id: "usage",
    question: "Where can I see my remaining allowance?",
    answer:
      "Open Settings → Plan & Billing to see your usage, limits, and reset date. The workspace tracks stored files, document and scanned pages, transcription, chat messages, and generated study sets. Your plan also sets how many files can process at once.",
  },
  {
    id: "renewal",
    question: "How do billing and cancellation work?",
    answer:
      "Pro renews monthly through Polar. You can change the billing currency before checkout. To see invoices, update your payment method, or cancel, open Manage billing. After cancellation, Pro stays active through your paid-through date. You can still review saved work on Free. New uploads pause if your files exceed the Free storage limit.",
  },
] as const

export default async function PricingPage() {
  const [requestHeaders, user] = await Promise.all([
    headers(),
    getCurrentUser(),
  ])
  const prices = monthlyPrices[getPricingCurrency(requestHeaders)]
  const checkoutAvailable = isPolarBillingConfigured()

  return (
    <MarketingShell authState={user ? "signed-in" : "guest"}>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[46rem] flex-1 px-5 pt-10 pb-20 outline-none sm:px-8 sm:pt-14 sm:pb-24"
      >
        <header className="text-center">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            Plans &amp; pricing
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Monthly prices in {prices.currencyName}.
          </p>
        </header>

        <section
          aria-label="Compare plans"
          className="mt-8 grid gap-5 sm:mt-10 sm:grid-cols-2 sm:gap-7"
        >
          {plans.map((plan) => {
            const isPro = plan.id === "pro"
            return (
              <article
                key={plan.id}
                aria-labelledby={`plan-${plan.id}`}
                className={cn(
                  "flex min-w-0 flex-col rounded-[2rem] p-7 sm:p-8",
                  isPro
                    ? "bg-neutral-900 text-white"
                    : "bg-white text-neutral-900 ring-1 ring-neutral-200 ring-inset"
                )}
              >
                <h2
                  id={`plan-${plan.id}`}
                  className="text-lg font-semibold tracking-tight"
                >
                  {plan.name}
                </h2>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="text-5xl leading-none tracking-[-0.035em]">
                    {prices[plan.id]}
                  </span>
                  <span
                    className={cn(
                      "text-base",
                      isPro ? "text-neutral-300" : "text-neutral-600"
                    )}
                  >
                    / month
                  </span>
                </p>
                <p className="mt-4 text-sm leading-snug text-balance">
                  {plan.description}
                </p>
                <ul
                  className={cn(
                    "mt-5 grid gap-3.5 border-t pt-5",
                    isPro ? "border-white/20" : "border-neutral-200"
                  )}
                >
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm leading-snug"
                    >
                      <Check aria-hidden="true" className="size-5 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  {isPro && !checkoutAvailable ? (
                    <Button
                      disabled
                      className="h-11 w-full rounded-full bg-white text-neutral-900"
                    >
                      Checkout unavailable
                    </Button>
                  ) : (
                    <Link
                      href={workspaceHref(plan.href)}
                      prefetch={false}
                      className={cn(
                        buttonVariants(),
                        "h-11 w-full rounded-full",
                        isPro
                          ? "bg-white text-neutral-900 hover:bg-neutral-200"
                          : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                      )}
                    >
                      {plan.action}
                    </Link>
                  )}
                </div>
              </article>
            )
          })}
        </section>

        <section aria-labelledby="details-heading" className="mt-14 sm:mt-16">
          <h2
            id="details-heading"
            className="mb-4 text-2xl font-semibold tracking-tight"
          >
            Plan details
          </h2>
          {planDetails.map(({ id, question, answer }) => (
            <details key={id} className="group border-b border-border/70">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring sm:text-base [&::-webkit-details-marker]:hidden">
                {question}
                <Plus
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground group-open:rotate-45"
                />
              </summary>
              <p
                id={id}
                className="scroll-mt-28 pb-5 text-sm leading-relaxed text-muted-foreground"
              >
                {answer}
              </p>
            </details>
          ))}
        </section>
      </main>
    </MarketingShell>
  )
}
