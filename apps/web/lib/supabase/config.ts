export function getSupabaseConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error("Supabase URL and publishable key are required.")
  }

  return { url, publishableKey }
}
