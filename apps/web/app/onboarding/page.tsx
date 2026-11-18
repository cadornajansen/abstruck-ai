import { redirect } from "next/navigation"

import { completeOnboarding } from "@/app/onboarding/actions"
import { OnboardingScreen } from "@/components/auth/onboarding-screen"
import { requireUser } from "@/lib/auth/session"
import { getProfile } from "@/lib/profile"

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding")
  const profile = await getProfile(user.id)
  if (profile?.onboarding_completed_at) redirect("/")
  return <OnboardingScreen action={completeOnboarding} />
}
