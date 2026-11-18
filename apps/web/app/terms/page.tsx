import { marketingMetadata } from "@/components/marketing/metadata"
import Link from "next/link"
import { PublicPage, PublicSection } from "@/components/public-page"

export const metadata = marketingMetadata(
  "Terms",
  "Terms for using the Abstruck development study workspace, including content ownership, study outputs, provisional plans and account controls.",
  "/terms"
)

export default function TermsPage() {
  return (
    <PublicPage
      active="terms"
      title="Terms of use"
      description="These terms describe the current development MVP. Public launch and live customer payments remain pending. Updated November 3, 2026."
    >
      <div className="flex max-w-3xl flex-col gap-8">
        <PublicSection title="Using the development workspace">
          <p>
            Abstruck is a study workspace for bringing materials, understanding
            them, practising and returning to review. Features and usage
            allowances are being validated, and availability can change during
            development.
          </p>
          <p>
            Use your own account, keep access credentials secure, and respect
            other people’s rights. Use the service within its access controls
            and usage limits.
          </p>
        </PublicSection>
        <PublicSection title="Your materials and saved work">
          <p>
            You retain the rights you hold in the materials you bring. Upload,
            process and share only content you have the right to use. Abstruck
            processes your content to provide the study features and account
            operations you request.
          </p>
          <p>
            Supported formats and source limits are shown in the workspace. A
            source can be unavailable, partially extracted or rejected. Review
            its processing status before relying on an output.
          </p>
        </PublicSection>
        <PublicSection title="AI-assisted study">
          <p>
            Generated answers, summaries, cards, practice questions, scores,
            diagrams and narration can contain mistakes or omissions. Check
            important information and feedback against your materials.
          </p>
          <p>
            Material-based outputs use the selected source context.
            Conversation-based outputs use recent saved conversation context and
            can have no material citations. Keep your own copy of work you need
            to retain.
          </p>
        </PublicSection>
        <PublicSection title="Free and Paid access">
          <p>
            Free is an ongoing plan. The Paid plan is ₱199 for 30 days, with the
            same supported tools and higher provisional usage allowances.
            Numeric allowances are subject to cost and product validation;
            current development limits are visible in Settings → Plan &amp;
            Billing.
          </p>
          <p>
            Each QR Ph renewal is initiated by you. There is no automatic debit.
            An early renewal starts a future paid period after existing paid
            access expires. When Paid access ends, the account returns to Free;
            new uploads can pause if retained files exceed Free storage limits.
          </p>
          <p>
            Current checkout is sandbox/test mode. Live-payment and refund terms
            must be finalized before accepting live customer payments. Use{" "}
            <Link
              href="/support"
              prefetch={false}
              className="text-foreground underline underline-offset-4"
            >
              Support
            </Link>{" "}
            with an order reference for a payment-status question. See{" "}
            <Link
              href="/pricing"
              className="text-foreground underline underline-offset-4"
            >
              Pricing
            </Link>{" "}
            for the current plan description.
          </p>
        </PublicSection>
        <PublicSection title="Sharing, export and account removal">
          <p>
            A share link discloses a selected saved snapshot and any originals
            you explicitly include. Changes to private work do not automatically
            update an existing shared snapshot. Recipients can retain copies;
            revoking a link stops future access through that link.
          </p>
          <p>
            Export and deletion requests are available in Settings → Data
            controls. Export downloads have a limited availability period.
            Source deletion can preserve saved outputs and attempts; account
            deletion first blocks access, then continues background cleanup.
          </p>
          <p>
            The{" "}
            <Link
              href="/privacy"
              className="text-foreground underline underline-offset-4"
            >
              Privacy notice
            </Link>{" "}
            describes processing providers, retained operational records and the
            current deletion limits.
          </p>
        </PublicSection>
        <PublicSection title="Support and updates">
          <p>
            <Link
              href="/support"
              prefetch={false}
              className="text-foreground underline underline-offset-4"
            >
              Help &amp; Support
            </Link>{" "}
            accepts signed-in requests and optional owned job/payment
            references. Its receipt shows delivery status; a received request
            does not promise an immediate reply.
          </p>
          <p>
            These pages will need review as the MVP changes and before public
            launch. No response-time, uptime or completed operational-validation
            commitment is made by this development release.
          </p>
        </PublicSection>
      </div>
    </PublicPage>
  )
}
