export interface SpaceFolder {
  id: string
  spaceId: string
  title: string
  revision: number
  createdAt: string
  updatedAt: string
  materialCount: number
}
export type StudyFolder = SpaceFolder

export interface MaterialLocation {
  materialId: string
  spaceId: string | null
  folderId: string | null
  revision: number
}

export interface MoveMaterialInput {
  spaceId: string | null
  folderId: string | null
  revision: number
}

export interface SpaceNavigationPreference {
  id: string
  isPinned: boolean
  sortOrder: number | null
}
