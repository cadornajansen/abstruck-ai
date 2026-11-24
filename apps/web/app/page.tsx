import { ConnectedHome } from "@/components/connected-home"
import { createSpace } from "@/app/actions/spaces"
import { signOut } from "@/app/auth/actions"
import { getCurrentUser } from "@/lib/auth/session"
import { getSpaces } from "@/lib/spaces"
import { getProfile } from "@/lib/profile"
import { getRecentMaterials } from "@/lib/library"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import {
  APP_HOSTNAME,
  MARKETING_HOSTNAME,
  isProductionRelease,
} from "@/lib/release"
import { MarketingShell } from "@/components/marketing/marketing-shell"
import { LandingContent } from "@/components/marketing/landing"
import { marketingMetadata } from "@/components/marketing/metadata"

export const metadata = marketingMetadata(
  "Your study workspace",
  "Bring your materials, understand, practise and review in one calm workspace.",
  "/"
)

export default async function Page() {
  const productionHost = isProductionRelease()
    ? (await headers()).get("host")
    : null
  const user =
    productionHost === MARKETING_HOSTNAME ? null : await getCurrentUser()
  if (!user) {
    if (productionHost === APP_HOSTNAME) redirect("/sign-in")
    return (
      <MarketingShell authState="guest" footerVariant="compact">
        <LandingContent />
      </MarketingShell>
    )
  }
  const profile = await getProfile(user.id)
  if (!profile?.onboarding_completed_at) redirect("/onboarding")
  const [spaces, recentMaterials] = await Promise.all([
    getSpaces(user.id),
    getRecentMaterials(user.id),
  ])
  return (
    <ConnectedHome
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={profile.display_name ?? undefined}
      createSpaceAction={createSpace}
      signOutAction={signOut}
    />
  )
}
