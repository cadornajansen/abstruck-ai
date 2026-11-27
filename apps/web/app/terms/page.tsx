import { marketingMetadata } from "@/components/marketing/metadata"
import Link from "next/link"
import { workspaceHref } from "@/lib/release"
import { PublicPage, PublicSection } from "@/components/public-page"

export const metadata = marketingMetadata(
  "Terms",
  "Terms for using the Abstruck study workspace, including content ownership, study outputs, subscriptions and account controls.",
  "/terms"
)

export default function TermsPage() {
  return (
    <PublicPage
      active="terms"
      title="Terms of use"
      description="These terms cover Free and Pro accounts. Updated November 27, 2026."
    >
      <div className="flex max-w-3xl flex-col gap-8">
        <PublicSection title="Using the workspace">
          <p>
            Abstruck is a study workspace for bringing materials, understanding
            them, practising and returning to review. Features and usage
            allowances are being validated, and availability can change.
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
        <PublicSection title="Free and Pro access">
          <p>
            Free is an ongoing plan. Pro is a monthly subscription sold through
            Polar, our merchant of record. Your checkout shows the price,
            currency, and any applicable taxes before you subscribe.
          </p>
          <p>
            Pro renews automatically until you cancel. Open Settings → Plan
            &amp; Billing to manage your payment method, download invoices, or
            cancel through Polar. When you cancel, you keep Pro access through
            the end of the paid period, then return to Free. Your saved study
            work stays available.
          </p>
          <p>
            See{" "}
            <Link
              href="/pricing"
              className="text-foreground underline underline-offset-4"
            >
              Pricing
            </Link>{" "}
            for current allowances. For a billing question or refund request,
            contact{" "}
            <Link
              href={workspaceHref("/support")}
              prefetch={false}
              className="text-foreground underline underline-offset-4"
            >
              Abstruck Support
            </Link>{" "}
            with your invoice reference.
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
              href={workspaceHref("/support")}
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
            These pages may change as the workspace develops. During the beta,
            availability and response times may vary.
          </p>
        </PublicSection>
      </div>
    </PublicPage>
  )
}
