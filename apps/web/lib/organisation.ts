import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, Tables } from "@/lib/supabase/database.types"
import type {
  StudyFolder,
  MaterialLocation,
  MoveMaterialInput,
} from "@/lib/organisation-types"

export type {
  StudyFolder,
  MaterialLocation,
  MoveMaterialInput,
} from "@/lib/organisation-types"
const columns =
  "id,space_id,title,revision,created_at,updated_at,materials!materials_folder_owner_space_fkey(count)"
type FolderRow = Pick<
  Tables<"folders">,
  "id" | "space_id" | "title" | "revision" | "created_at" | "updated_at"
> & { materials: { count: number }[] }
function folderDto(row: FolderRow): StudyFolder {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    materialCount: row.materials[0]?.count ?? 0,
  }
}

export async function getFolders(
  ownerId: string,
  spaceId?: string
): Promise<StudyFolder[]> {
  const db = await createClient()
  let query = db
    .from("folders")
    .select(columns)
    .eq("owner_id", ownerId)
    .order("created_at")
  if (spaceId) query = query.eq("space_id", spaceId)
  const { data, error } = await query
  if (error) throw new Error("Your folders could not be loaded.")
  return data.map(folderDto)
}

export async function getFolder(
  ownerId: string,
  id: string
): Promise<StudyFolder | null> {
  const db = await createClient()
  const { data, error } = await db
    .from("folders")
    .select(columns)
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error("This folder could not be loaded.")
  return data ? folderDto(data) : null
}

export class OrganisationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly folder?: StudyFolder,
    readonly location?: MaterialLocation
  ) {
    super(message)
  }
}
interface Reply {
  status: string
  folderId?: string
  spaceId?: string | null
  materialId?: string
  revision?: number
  movedMaterialCount?: number
  unfiledCount?: number
}
async function checked(
  ownerId: string,
  result: { data: Json; error: { message: string } | null }
): Promise<Reply> {
  if (
    result.error ||
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  )
    throw new OrganisationError(
      409,
      "This change could not be saved. Refresh and try again."
    )
  const reply = result.data as unknown as Reply
  if (reply.status === "ok") return reply
  const folder = reply.folderId
    ? ((await getFolder(ownerId, reply.folderId)) ?? undefined)
    : undefined
  const location = reply.materialId
    ? {
        materialId: reply.materialId,
        spaceId: reply.spaceId ?? null,
        folderId: reply.folderId ?? null,
        revision: reply.revision ?? 0,
      }
    : undefined
  const status =
    reply.status === "not_found"
      ? 404
      : reply.status === "invalid" || reply.status === "chat_library_only"
        ? 400
        : 409
  const message =
    reply.status === "not_found"
      ? "This folder, material or destination is no longer available."
      : reply.status === "chat_library_only"
        ? "Independent chats stay in My Library."
        : reply.status === "conflict"
          ? "This location or folder changed in another tab. Refresh its details before saving."
          : reply.status === "request_conflict"
            ? "This creation request already belongs to another folder."
            : "Check the folder name and destination."
  throw new OrganisationError(status, message, folder, location)
}

async function requiredFolder(
  ownerId: string,
  reply: Reply
): Promise<StudyFolder> {
  const folder = reply.folderId
    ? await getFolder(ownerId, reply.folderId)
    : null
  if (!folder)
    throw new OrganisationError(404, "This folder is no longer available.")
  return folder
}

export async function createFolder(
  ownerId: string,
  spaceId: string,
  requestId: string,
  title?: string
): Promise<StudyFolder> {
  const result = await createAdminClient().rpc("create_space_folder", {
    p_owner_id: ownerId,
    p_space_id: spaceId,
    p_request_id: requestId,
    p_title: (title ?? null) as string,
  })
  return requiredFolder(ownerId, await checked(ownerId, result))
}
export async function renameFolder(
  ownerId: string,
  id: string,
  revision: number,
  title: string
): Promise<StudyFolder> {
  const result = await createAdminClient().rpc("rename_space_folder", {
    p_owner_id: ownerId,
    p_folder_id: id,
    p_revision: revision,
    p_title: title,
  })
  return requiredFolder(ownerId, await checked(ownerId, result))
}
export async function deleteFolder(
  ownerId: string,
  id: string,
  revision: number
): Promise<{ deleted: true; spaceId: string; unfiledCount: number }> {
  const reply = await checked(
    ownerId,
    await createAdminClient().rpc("delete_space_folder", {
      p_owner_id: ownerId,
      p_folder_id: id,
      p_revision: revision,
    })
  )
  return {
    deleted: true,
    spaceId: reply.spaceId!,
    unfiledCount: reply.unfiledCount ?? 0,
  }
}
export async function moveFolder(
  ownerId: string,
  id: string,
  revision: number,
  spaceId: string
): Promise<{ folder: StudyFolder; movedMaterialCount: number }> {
  const reply = await checked(
    ownerId,
    await createAdminClient().rpc("move_space_folder", {
      p_owner_id: ownerId,
      p_folder_id: id,
      p_revision: revision,
      p_space_id: spaceId,
    })
  )
  return {
    folder: await requiredFolder(ownerId, reply),
    movedMaterialCount: reply.movedMaterialCount ?? 0,
  }
}
export async function moveMaterial(
  ownerId: string,
  id: string,
  input: MoveMaterialInput
): Promise<MaterialLocation> {
  const reply = await checked(
    ownerId,
    await createAdminClient().rpc("move_material_location", {
      p_owner_id: ownerId,
      p_material_id: id,
      p_space_id: input.spaceId as string,
      p_folder_id: input.folderId as string,
      p_revision: input.revision,
    })
  )
  return {
    materialId: reply.materialId!,
    spaceId: reply.spaceId ?? null,
    folderId: reply.folderId ?? null,
    revision: reply.revision!,
  }
}
