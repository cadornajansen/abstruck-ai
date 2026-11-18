import {
  ChatBubble,
  MenuScale,
  MusicDoubleNote,
  Page,
  PageEdit,
  Play,
  Presentation,
} from "iconoir-react"

const materialIcons: Record<string, typeof Page> = {
  video: Play,
  youtube: Play,
  audio: MusicDoubleNote,
  pdf: Page,
  docx: PageEdit,
  pptx: Presentation,
  document: Page,
  text: MenuScale,
  paste: MenuScale,
  chat: ChatBubble,
  conversation: ChatBubble,
}

export function MaterialIcon({
  type,
  className,
}: {
  type?: string
  className?: string
}) {
  const kind = typeof type === "string" ? type.toLowerCase() : ""
  const Icon = Object.hasOwn(materialIcons, kind)
    ? (materialIcons[kind] ?? Page)
    : Page
  return <Icon aria-hidden="true" className={className} />
}
