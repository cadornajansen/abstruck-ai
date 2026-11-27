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
import { WebsiteStructuredData } from "@/components/marketing/structured-data"
import { SEARCH_DESCRIPTION, SEARCH_TITLE } from "@/lib/public-seo"

export async function generateMetadata() {
  if (
    isProductionRelease() &&
    (await headers()).get("host") !== MARKETING_HOSTNAME
  )
    return { title: "Abstruck — Your study workspace" }
  return marketingMetadata(SEARCH_TITLE, SEARCH_DESCRIPTION, "/")
}

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
        <WebsiteStructuredData />
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
