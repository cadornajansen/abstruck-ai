import "server-only"

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

export function createAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Server database configuration is missing.")
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
