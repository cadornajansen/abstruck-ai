"use server"

import { revalidatePath } from "next/cache"

import { requireUser, ensureProfile } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const spaceIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createSpace(
  formData: FormData
): Promise<{ id?: string; error?: string }> {
  const user = await requireUser()
  const requestedId = formData.get("spaceId")
  if (requestedId !== null) {
    if (typeof requestedId !== "string" || !spaceIdPattern.test(requestedId))
      return { error: "Your space could not be created. Please try again." }
    await ensureProfile(user)
    const { data, error } = await createAdminClient().rpc(
      "create_untitled_space",
      {
        p_owner_id: user.id,
        p_space_id: requestedId,
      }
    )
    if (
      error ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.id !== "string"
    )
      return { error: "Your space could not be created. Please try again." }
    revalidatePath("/")
    revalidatePath("/library")
    return { id: data.id }
  }
  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  if (!title || title.length > 120) {
    return { error: "Enter a space name between 1 and 120 characters." }
  }
  if (description.length > 1000)
    return { error: "Keep the description under 1,000 characters." }

  await ensureProfile(user)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("spaces")
    .insert({ owner_id: user.id, title, description: description || null })
    .select("id")
    .single()

  if (error)
    return { error: "Your space could not be saved. Please try again." }
  revalidatePath("/")
  return { id: data.id }
}
