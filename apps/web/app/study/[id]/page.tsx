import { notFound, redirect } from "next/navigation"
import { createSpace } from "@/app/actions/spaces"
import { signOut } from "@/app/auth/actions"
import { SavedStudyWorkspace } from "@/components/workspace/saved-study-workspace"
import { requireUser } from "@/lib/auth/session"
import { getLibraryMaterials, getRecentMaterials } from "@/lib/library"
import { getProfile } from "@/lib/profile"
import { getSpaces } from "@/lib/spaces"
import { getStudySet } from "@/lib/study-sets"

export default async function SavedStudyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id
    )
  )
    notFound()
  const user = await requireUser(`/study/${id}`)
  const studySet = await getStudySet(user.id, id)
  if (!studySet) notFound()
  if (studySet.type === "exam") redirect(`/assessments/${id}`)
  const [profile, spaces, recentMaterials, materials] = await Promise.all([
    getProfile(user.id),
    getSpaces(user.id),
    getRecentMaterials(user.id),
    getLibraryMaterials(user.id),
  ])
  return (
    <SavedStudyWorkspace
      studySet={studySet}
      availableSourceIds={materials.map((material) => material.id)}
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={profile?.display_name ?? "Your workspace"}
      signOutAction={signOut}
      createSpaceAction={createSpace}
    />
  )
}
