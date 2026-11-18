import { createSpace } from "@/app/actions/spaces"
import { signOut } from "@/app/auth/actions"
import { LibraryScreen } from "@/components/workspace/library-screen"
import { requireUser } from "@/lib/auth/session"
import { getProfile } from "@/lib/profile"
import { getSpaces } from "@/lib/spaces"
import { getLibraryMaterials, getHistoryMaterialIds } from "@/lib/library"
import { getPreservedStudySets } from "@/lib/study-sets"

export async function LibraryPage({
  kind,
  defaultSearchOpen = false,
  unfiledOnly = false,
}: {
  kind: "library" | "history"
  defaultSearchOpen?: boolean
  unfiledOnly?: boolean
}) {
  const user = await requireUser(`/${kind}`)
  const [profile, spaces, materials, history, preservedSets] =
    await Promise.all([
      getProfile(user.id),
      getSpaces(user.id),
      getLibraryMaterials(user.id),
      getHistoryMaterialIds(user.id),
      getPreservedStudySets(user.id),
    ])
  const byId = new Map(materials.map((material) => [material.id, material]))
  const historyMaterials = history.flatMap((id) => {
    const material = byId.get(id)
    return material ? [material] : []
  })
  const visible =
    kind === "history"
      ? historyMaterials
      : unfiledOnly
        ? materials.filter((material) => material.space_id === null)
        : materials
  const order = [
    ...new Set([...history, ...materials.map((material) => material.id)]),
  ]
  const recentMaterials = order.flatMap((id) => {
    const material = byId.get(id)
    return material
      ? [
          {
            id,
            title: material.title,
            spaceId: material.space_id,
            folderId: material.folder_id,
            sourceType: material.source_type,
          },
        ]
      : []
  })
  const sourceLabels: Record<string, string> = {
    pdf: "PDF",
    docx: "Word",
    pptx: "PowerPoint",
    text: "Text",
    audio: "Audio",
    video: "Video",
    youtube: "YouTube",
    chat: "Chat",
  }
  const items = visible.map((material) => ({
    id: material.id,
    title: material.title,
    sourceType: material.source_type,
    spaceId: material.space_id,
    folderId: material.folder_id,
    locationRevision: material.location_revision,
    status: material.status,
    createdAt: material.created_at,
    detail:
      material.source_type === "chat"
        ? "Saved conversation"
        : material.status === "ready"
          ? `${sourceLabels[material.source_type] ?? "Material"} · Ready to study`
          : material.status === "partial"
            ? `${sourceLabels[material.source_type] ?? "Material"} · Some content unavailable`
            : material.status === "failed"
              ? `${sourceLabels[material.source_type] ?? "Material"} · Processing failed`
              : `${sourceLabels[material.source_type] ?? "Material"} · Processing`,
    space:
      spaces.find((space) => space.id === material.space_id)?.title ??
      "Unfiled",
    href: `/materials/${material.id}`,
  }))
  return (
    <LibraryScreen
      kind={kind}
      unfiledOnly={unfiledOnly}
      defaultSearchOpen={defaultSearchOpen}
      items={items}
      preservedSets={preservedSets}
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={profile?.display_name ?? "Your workspace"}
      signOutAction={signOut}
      createSpaceAction={createSpace}
    />
  )
}
