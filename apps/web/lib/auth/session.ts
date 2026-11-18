import "server-only"

import type { User } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  // A deletion request fences access before the background cleanup finishes.
  const { data: active, error: activeError } =
    await supabase.rpc("account_is_active")
  return activeError || !active ? null : data.user
}

export async function requireUser(next = "/"): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  return user
}

export async function ensureProfile(user: User): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id }, { onConflict: "id", ignoreDuplicates: true })
  if (error)
    throw new Error("Your profile could not be loaded. Please try again.")
}
