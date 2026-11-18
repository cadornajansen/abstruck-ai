import { LibraryPage } from "@/components/library-page"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter } = await searchParams
  return <LibraryPage kind="library" unfiledOnly={filter === "unfiled"} />
}
