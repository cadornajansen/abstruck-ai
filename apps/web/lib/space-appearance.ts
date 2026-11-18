export const spaceIconNames = [
  "Book",
  "OpenBook",
  "Journal",
  "Notes",
  "Folder",
  "Flask",
  "Atom",
  "Brain",
  "Calculator",
  "Code",
  "Globe",
  "MusicNote",
  "Play",
  "GraduationCap",
  "DesignPencil",
  "Camera",
  "Clock",
  "LightBulb",
  "SunLight",
  "Leaf",
  "Heart",
  "Star",
  "Rocket",
  "Language",
  "MathBook",
  "Translate",
  "Computer",
  "GraphUp",
  "Tree",
  "Database",
  "Settings",
  "Network",
  "Palette",
  "Calendar",
  "BookStack",
  "Bank",
  "Medal",
  "Puzzle",
  "WhiteFlag",
  "Gym",
  "ElectronicsChip",
  "City",
  "Building",
  "CodeBrackets",
  "Page",
  "Headset",
  "Emoji",
] as const

export type SpaceIconName = (typeof spaceIconNames)[number]
export const spaceIconColors = [
  "#404040",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
  "#EC4899",
  "#6366F1",
  "#6B7280",
  "#14B8A6",
  "#06B6D4",
  "#10B981",
  "#8B5CF6",
  "#D946EF",
  "#F43F5E",
  "#F59E0B",
  "#84CC16",
  "#0EA5E9",
  "#78716C",
] as const
export const SPACE_COVER_BYTES = 2_000_000

export interface SpaceAppearance {
  iconName?: SpaceIconName | null
  iconColor?: string | null
  detailsRevision?: number
  hasCover?: boolean
}
export interface SpaceDetails extends SpaceAppearance {
  id: string
  title: string
  description: string | null
}
export interface SpaceDetailsPatch {
  title?: string
  description?: string
  icon?: { name: SpaceIconName; color: string } | null
}
export function isSpaceIconName(value: unknown): value is SpaceIconName {
  return (
    typeof value === "string" && spaceIconNames.some((name) => name === value)
  )
}
export function spaceCoverUrl(space: {
  id: string
  detailsRevision?: number
}): string {
  return `/api/spaces/${space.id}/cover?v=${space.detailsRevision ?? 0}`
}
