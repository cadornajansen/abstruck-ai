import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getRecentMaterials } from "@/lib/library"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to search your workspace." },
      { status: 401 }
    )
  const query =
    new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? ""
  const libraryOnly =
    new URL(request.url).searchParams.get("scope") === "library"
  const db = await createClient()
  const { data: spaces, error } = await db
    .from("spaces")
    .select("id,title")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
  if (error)
    return Response.json(
      { error: "Search could not be loaded." },
      { status: 503 }
    )
  const matchingSpaces = spaces.filter((space) =>
    space.title.toLowerCase().includes(query.toLowerCase())
  )
  let materials: { id: string; title: string; spaceId: string | null }[]
  if (!query && !libraryOnly) materials = await getRecentMaterials(user.id)
  else {
    const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
    let titleQuery = db
      .from("materials")
      .select("id,title,space_id")
      .eq("owner_id", user.id)
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(30)
    if (libraryOnly) titleQuery = titleQuery.is("space_id", null)
    const byTitle = await titleQuery
    if (byTitle.error)
      return Response.json(
        { error: "Search could not be loaded." },
        { status: 503 }
      )
    const results = [...byTitle.data]
    if (query && !libraryOnly && matchingSpaces.length) {
      const bySpace = await db
        .from("materials")
        .select("id,title,space_id")
        .eq("owner_id", user.id)
        .in(
          "space_id",
          matchingSpaces.map((space) => space.id)
        )
        .order("updated_at", { ascending: false })
        .limit(30)
      if (bySpace.error)
        return Response.json(
          { error: "Search could not be loaded." },
          { status: 503 }
        )
      for (const material of bySpace.data)
        if (!results.some((item) => item.id === material.id))
          results.push(material)
    }
    materials = results.map(({ space_id, ...material }) => ({
      ...material,
      spaceId: space_id,
    }))
  }
  return Response.json(
    {
      materials: materials.map((material) => ({
        ...material,
        spaceName:
          spaces.find((space) => space.id === material.spaceId)?.title ??
          "My Library",
      })),
      spaces: matchingSpaces,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}
