import "server-only"

import { createClient } from "@/lib/supabase/server"
import { signRead } from "@/lib/storage/r2"

export async function getSpaceMaterials(spaceId: string) {
  const db = await createClient()
  const { data, error } = await db
    .from("materials")
    .select(
      "id,title,status,space_id,folder_id,location_revision,source_type,created_at,assets(role,object_key,uploaded_at)"
    )
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
  if (error) throw new Error("Your materials could not be loaded.")
  return Promise.all(
    data.map(async ({ assets, ...material }) => {
      const role = ["docx", "pptx"].includes(material.source_type)
        ? "normalized_pdf"
        : "original"
      const asset = ["pdf", "docx", "pptx"].includes(material.source_type)
        ? assets.find(
            (candidate) => candidate.role === role && candidate.uploaded_at
          )
        : undefined
      let previewUrl: string | undefined
      if (asset) {
        try {
          previewUrl = await signRead(asset.object_key)
        } catch {
          /* The material remains available without a preview. */
        }
      }
      return { ...material, previewUrl }
    })
  )
}

export async function getMaterial(id: string) {
  const db = await createClient()
  const { data, error } = await db
    .from("materials")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error || !data) return null
  return data
}
