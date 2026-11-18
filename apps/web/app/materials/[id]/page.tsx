import { notFound } from "next/navigation"
import { ConnectedMaterial } from "@/components/connected-material"
import { signOut } from "@/app/auth/actions"
import { requireUser } from "@/lib/auth/session"
import { getMaterial } from "@/lib/materials"
import { getSpaces } from "@/lib/spaces"
import { createSpace } from "@/app/actions/spaces"
import { getProfile } from "@/lib/profile"
import {
  getLibraryMaterials,
  getRecentMaterials,
  getReadingPosition,
} from "@/lib/library"

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; t?: string }>
}) {
  const { id } = await params
  const user = await requireUser(`/materials/${id}`)
  const material = await getMaterial(id)
  if (!material) notFound()
  const query = await searchParams
  const targetPage = Number(query.page)
  const targetTime = Number(query.t)
  const pageLimit = ["audio", "video", "youtube"].includes(material.source_type)
    ? 10000
    : 200
  const hasTargetPage =
    Number.isInteger(targetPage) && targetPage > 0 && targetPage <= pageLimit
  const hasTargetTime =
    Number.isFinite(targetTime) && targetTime >= 0 && targetTime <= 3600
  const [spaces, profile, recentMaterials, readingPosition, library] =
    await Promise.all([
      getSpaces(user.id),
      getProfile(user.id),
      getRecentMaterials(user.id),
      getReadingPosition(user.id, id, material.extraction_version),
      getLibraryMaterials(user.id),
    ])
  return (
    <ConnectedMaterial
      key={material.id}
      createSpaceAction={createSpace}
      recentMaterials={recentMaterials}
      contextMaterials={library
        .filter(
          (item) =>
            item.source_type !== "chat" &&
            (item.status === "ready" || item.status === "partial")
        )
        .map(({ id, title, source_type }) => ({
          id,
          title,
          sourceType: source_type,
        }))}
      initialReadingPosition={{
        ...readingPosition,
        page: hasTargetPage ? targetPage : readingPosition.page,
        timeMs: hasTargetTime
          ? Math.round(targetTime * 1000)
          : hasTargetPage
            ? undefined
            : readingPosition.timeMs,
      }}
      initialShowSource={hasTargetPage || hasTargetTime}
      initialMaterial={material}
      spaces={spaces}
      userName={profile?.display_name ?? "Your workspace"}
      signOutAction={signOut}
    />
  )
}
