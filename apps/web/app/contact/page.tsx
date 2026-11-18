import Link from "next/link"
import { workspaceHref } from "@/lib/release"
import { ArrowRight } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { PublicPage, PublicSection } from "@/components/public-page"
import { marketingMetadata } from "@/components/marketing/metadata"

export const metadata = marketingMetadata(
  "Help & contact",
  "Find help with Abstruck materials, account access and usage questions through the existing support flow.",
  "/contact"
)
export default function ContactPage() {
  return (
    <PublicPage
      active="contact"
      title="Let’s get you back to studying."
      description="For a workspace problem or an account question, use Abstruck’s existing Help & Support flow. It currently requires sign-in."
    >
      <div className="flex max-w-3xl flex-col gap-10">
        <PublicSection title="Ask for help">
          <p>
            Describe what you were trying to do and what happened. You can
            include an owned job or order reference in the support screen. Keep
            passwords and private study content out of your message.
          </p>
          <div>
            <Button
              size="lg"
              className="h-11 rounded-full px-5"
              nativeButton={false}
              render={
                <Link href={workspaceHref("/support")} prefetch={false} />
              }
            >
              Open Help & Support
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
          <p>
            The support receipt shows delivery status. A response time has not
            been promised.
          </p>
        </PublicSection>
        <PublicSection title="Having trouble signing in?">
          <div className="flex flex-wrap gap-5">
            <Link
              href={workspaceHref("/reset-password")}
              className="underline underline-offset-4"
            >
              Reset your password
            </Link>
            <Link
              href={workspaceHref("/verify-email")}
              className="underline underline-offset-4"
            >
              Resend verification email
            </Link>
            <Link
              href={workspaceHref("/sign-in")}
              className="underline underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        </PublicSection>
        <PublicSection title="Plans and your data">
          <p>
            Read{" "}
            <Link href="/pricing" className="underline underline-offset-4">
              Pricing
            </Link>{" "}
            for plan details, or the{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy notice
            </Link>{" "}
            for export, deletion and sharing information.
          </p>
        </PublicSection>
      </div>
    </PublicPage>
  )
}
