import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"
import { getFolders } from "@/lib/organisation"
import type { SpaceFolder } from "@/lib/organisation-types"
import { isSpaceIconName, type SpaceAppearance } from "@/lib/space-appearance"

export type StudySpace = Pick<
  Tables<"spaces">,
  "id" | "title" | "description"
> &
  SpaceAppearance & {
    createdAt: string
    folders: SpaceFolder[]
    isPinned: boolean
    sortOrder: number | null
  }

export async function getSpaces(ownerId: string): Promise<StudySpace[]> {
  const supabase = await createClient()
  const [{ data, error }, folders, covers] = await Promise.all([
    supabase
      .from("spaces")
      .select(
        "id,title,description,created_at,is_pinned,sort_order,icon_name,icon_color,details_revision"
      )
      .eq("owner_id", ownerId)
      .order("is_pinned", { ascending: false })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    getFolders(ownerId),
    supabase
      .from("assets")
      .select("space_id")
      .eq("owner_id", ownerId)
      .eq("role", "space_cover")
      .not("uploaded_at", "is", null),
  ])
  if (error || covers.error)
    throw new Error("Your spaces could not be loaded. Please try again.")
  const covered = new Set(covers.data?.map((asset) => asset.space_id))
  return data.map(
    ({
      is_pinned,
      sort_order,
      icon_name,
      icon_color,
      details_revision,
      created_at,
      ...space
    }) => ({
      ...space,
      createdAt: created_at,
      isPinned: is_pinned,
      sortOrder: sort_order,
      iconName: isSpaceIconName(icon_name) ? icon_name : null,
      iconColor: icon_color,
      detailsRevision: details_revision,
      hasCover: covered.has(space.id),
      folders: folders.filter((folder) => folder.spaceId === space.id),
    })
  )
}
