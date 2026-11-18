import { notFound } from "next/navigation"
import { UiPreview } from "@/components/preview/ui-preview"

export const metadata = {
  title: "Abstruck UI preview",
  robots: { index: false, follow: false },
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ screen?: string[] }>
}) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { screen = [] } = await params
  if (
    screen.length > 1 ||
    ![
      "",
      "space",
      "library",
      "history",
      "search",
      "workspace",
      "summary",
      "notes",
      "flashcards",
      "quiz",
      "processing",
      "landing",
      "onboarding",
      "billing",
    ].includes(screen[0] ?? "")
  )
    notFound()
  return <UiPreview screen={screen[0] ?? ""} />
}
