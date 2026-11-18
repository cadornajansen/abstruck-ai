import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { Tables } from "@/lib/supabase/database.types"

export async function getProfile(
  ownerId: string
): Promise<Tables<"profiles"> | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .maybeSingle()
  if (error)
    throw new Error("Your profile could not be loaded. Please try again.")
  return data
}
