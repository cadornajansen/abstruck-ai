import { notFound } from "next/navigation"

import { createSpace } from "@/app/actions/spaces"
import { signOut } from "@/app/auth/actions"
import { ConnectedSpaceHome } from "@/components/connected-home"
import { getMaterial, getSpaceMaterials } from "@/lib/materials"
import { requireUser } from "@/lib/auth/session"
import { getSpaces } from "@/lib/spaces"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/profile"
import { getRecentMaterials } from "@/lib/library"

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ folderId?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const folderId = query.folderId
  if (
    folderId !== undefined &&
    (typeof folderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        folderId
      ))
  )
    notFound()
  const returnTo = folderId
    ? `/spaces/${id}?${new URLSearchParams({ folderId })}`
    : `/spaces/${id}`
  const user = await requireUser(returnTo)
  const supabase = await createClient()
  const { data: space, error } = await supabase
    .from("spaces")
    .select("id, title, description")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle()

  if (error || !space) notFound()
  const [spaces, materials, profile, recentMaterials] = await Promise.all([
    getSpaces(user.id),
    getSpaceMaterials(id),
    getProfile(user.id),
    getRecentMaterials(user.id),
  ])
  const folders = spaces.find((item) => item.id === id)?.folders ?? []
  const activeFolder = folderId
    ? folders.find((folder) => folder.id === folderId)
    : null
  if (folderId && !activeFolder) notFound()
  const items = materials.map((material) => ({
    id: material.id,
    title: material.title,
    sourceType: material.source_type,
    spaceId: material.space_id,
    folderId: material.folder_id,
    locationRevision: material.location_revision,
    status: material.status,
    detail: material.status.replaceAll("_", " "),
    space: space.title,
    href: `/materials/${material.id}`,
    createdAt: material.created_at,
    previewUrl: material.previewUrl,
  }))
  const studySources = materials
    .filter(
      (material) =>
        material.source_type !== "chat" &&
        ["ready", "partial"].includes(material.status)
    )
    .map((material) => ({
      id: material.id,
      title: material.title,
      sourceType: material.source_type,
    }))
  const studyMaterial = studySources[0]
    ? await getMaterial(studySources[0].id)
    : null

  return (
    <ConnectedSpaceHome
      space={spaces.find((item) => item.id === id) ?? space}
      spaces={spaces}
      folders={folders}
      activeFolder={activeFolder}
      recentMaterials={recentMaterials}
      userName={profile?.display_name ?? "Your workspace"}
      createSpaceAction={createSpace}
      signOutAction={signOut}
      materials={items.filter(
        (material) => material.folderId === (activeFolder?.id ?? null)
      )}
      folderMaterials={items.filter((material) => material.folderId !== null)}
      studyMaterial={studyMaterial}
      studySources={studySources}
    />
  )
}
