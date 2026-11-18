import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"

export type LibraryMaterial = Pick<
  Tables<"materials">,
  | "id"
  | "title"
  | "status"
  | "space_id"
  | "folder_id"
  | "location_revision"
  | "source_type"
  | "created_at"
>
export interface ReadingPosition {
  page: number
  activeTab: "chat" | "learn"
  timeMs?: number
}

export async function getLibraryMaterials(
  ownerId: string
): Promise<LibraryMaterial[]> {
  const db = await createClient()
  const { data, error } = await db
    .from("materials")
    .select(
      "id,title,status,space_id,folder_id,location_revision,source_type,created_at"
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
  if (error) throw new Error("Your library could not be loaded.")
  return data
}

export async function getHistoryMaterialIds(
  ownerId: string
): Promise<string[]> {
  const db = await createClient()
  const { data, error } = await db
    .from("material_reading_state")
    .select("material_id")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
  if (error) throw new Error("Your recent study history could not be loaded.")
  return data.map((state) => state.material_id)
}

export async function getRecentMaterials(ownerId: string): Promise<
  {
    id: string
    title: string
    spaceId: string | null
    folderId: string | null
    sourceType: string
  }[]
> {
  const [materials, history] = await Promise.all([
    getLibraryMaterials(ownerId),
    getHistoryMaterialIds(ownerId),
  ])
  const order = [...new Set([...history, ...materials.map((item) => item.id)])]
  const byId = new Map(materials.map((item) => [item.id, item]))
  return order.flatMap((id) => {
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
}

export async function getReadingPosition(
  ownerId: string,
  materialId: string,
  version: number
): Promise<ReadingPosition> {
  const db = await createClient()
  const { data, error } = await db
    .from("material_reading_state")
    .select("locator,active_tab")
    .eq("owner_id", ownerId)
    .eq("material_id", materialId)
    .eq("extraction_version", version)
    .maybeSingle()
  if (error) throw new Error("Your reading position could not be loaded.")
  const locator = data?.locator
  const page =
    locator && typeof locator === "object" && !Array.isArray(locator)
      ? locator.page
      : 1
  return {
    page:
      typeof page === "number" &&
      Number.isInteger(page) &&
      page > 0 &&
      page <= 200
        ? page
        : 1,
    activeTab: data?.active_tab === "learn" ? "learn" : "chat",
    ...(locator &&
    typeof locator === "object" &&
    !Array.isArray(locator) &&
    locator.type === "time" &&
    typeof locator.time_ms === "number" &&
    locator.time_ms >= 0 &&
    locator.time_ms <= 3_600_000
      ? { timeMs: locator.time_ms }
      : {}),
  }
}
