import { marketingMetadata } from "@/components/marketing/metadata"
import Link from "next/link"
import { isProductionRelease, workspaceHref } from "@/lib/release"
import { PublicPage, PublicSection } from "@/components/public-page"

export const metadata = marketingMetadata(
  "Privacy",
  "How the Abstruck study workspace processes account data, materials, study activity, sharing and deletion requests.",
  "/privacy"
)

export default function PrivacyPage() {
  const beta = isProductionRelease()
  return (
    <PublicPage
      active="privacy"
      title="Privacy notice"
      description={
        beta
          ? "This notice describes how the Abstruck public beta handles your data. Updated November 18, 2026."
          : "This notice describes the current Abstruck development MVP. Public launch, final retention schedules and wider operational validation are still pending. Updated November 3, 2026."
      }
    >
      <div className="flex max-w-3xl flex-col gap-8">
        <PublicSection title="Data used by your workspace">
          <p>
            Abstruck processes your sign-in identity and email, display name and
            optional profile fields; uploaded files, pasted text and source
            links; extracted text and transcripts; conversations, saved study
            outputs and versions; annotations, reading position, answers and
            review progress.
          </p>
          <p>
            It also records usage, processing status and errors, access periods,
            sharing settings and support requests.
            {!beta &&
              " The development workspace also records test payment references."}
            Authentication uses cookies, and the interface stores some local
            display preferences, such as the selected list or grid view.
          </p>
        </PublicSection>
        <PublicSection title="Processing and service providers">
          <p>
            The application and background worker use this data to provide the
            study features you request, save your progress, apply usage limits,
            process account requests and support recovery.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              <strong className="font-medium text-foreground">Supabase</strong>{" "}
              handles authentication and the application database.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Cloudflare R2
              </strong>{" "}
              stores private originals, derived files, generated media and
              export archives.
            </li>
            <li>
              <strong className="font-medium text-foreground">OpenAI</strong>{" "}
              processes content for study chat, generated study outputs,
              scanned-page extraction and narration. Depending on the feature,
              inputs can include selected excerpts, page images or recent saved
              conversation context.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                AssemblyAI
              </strong>{" "}
              processes audio for transcription.
            </li>
            <li>
              <strong className="font-medium text-foreground">Resend</strong>{" "}
              handles authentication and transactional/support email. A support
              request includes your message and the verified account reply
              address.
            </li>
            {!beta && (
              <li>
                <strong className="font-medium text-foreground">
                  PayMongo
                </strong>{" "}
                provides hosted QR Ph checkout and payment status. Current
                checkout is sandbox/test mode.
              </li>
            )}
          </ul>
          <p>
            {beta
              ? "Vercel hosts the web application and AWS runs background processing. Provider-managed retention and backups are separate from Abstruck’s application cleanup."
              : "The development worker has no continuous production hosting. Provider-managed retention and backups are separate from Abstruck’s application cleanup."}
          </p>
        </PublicSection>
        <PublicSection title="Access and sharing">
          <p>
            Study files are private by default. The application checks account
            ownership before providing access and issues short-lived file links.
            Authorized background processing and support use the data needed for
            the requested operation.
          </p>
          <p>
            Sharing is explicit: a link exposes a selected saved-output snapshot
            and any original sources you choose to include. Anyone holding that
            link can read and copy the disclosed content. Private conversation
            history and assessment attempts are not automatically included.
          </p>
          <p>
            You can revoke a share link. Revocation stops future access through
            that link; it cannot recall files or content that a recipient has
            already copied.
          </p>
        </PublicSection>
        <PublicSection title="Export and deletion">
          <p>
            Settings → Data controls lets you request an export of retained
            account/study data and original files, within the export’s size
            limits. Ready export downloads are available for 24 hours, using
            refreshed short-lived download links.
          </p>
          <p>
            Deleting a material makes its source unavailable and queues file
            cleanup. Saved study outputs, versions and attempts can remain,
            including quotations already stored in those outputs.
          </p>
          <p>
            Accepted account deletion blocks account access and revokes shares
            before background cleanup finishes. Cleanup can need retries. An
            accepted request is not confirmation that every file, provider
            artifact or external copy has already been removed.
          </p>
          <p>
            Abstruck retains minimal deletion receipts and operations audit
            entries after account removal.
            {!beta &&
              " The development workspace also retains test payment-event evidence."}{" "}
            These records currently have no automated retention deadline.
            Private cleanup payloads are cleared after successful cleanup. Email
            already delivered to a recipient or provider cannot be unsent by
            deleting the account.
          </p>
        </PublicSection>
        <PublicSection title="Current limits and questions">
          <p>
            Some data can remain in backups or service providers after
            application cleanup. Retention and provider cleanup procedures are
            still being validated.
          </p>
          <p>
            Use{" "}
            <Link
              href={workspaceHref("/support")}
              prefetch={false}
              className="text-foreground underline underline-offset-4"
            >
              Help &amp; Support
            </Link>{" "}
            for questions or an existing request reference. Support currently
            requires sign-in. The{" "}
            <Link
              href="/terms"
              className="text-foreground underline underline-offset-4"
            >
              Terms
            </Link>{" "}
            describe use of the workspace.
          </p>
        </PublicSection>
      </div>
    </PublicPage>
  )
}
