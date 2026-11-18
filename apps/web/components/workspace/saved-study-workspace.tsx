"use client"

import { useRouter } from "next/navigation"
import { useCreateSpace } from "@/hooks/use-create-space"
import type { CreateSpaceAction } from "./create-space-dialog"
import {
  WorkspaceShell,
  type StudySpace,
  type RecentMaterial,
} from "./study-home"
import { StudyTools } from "./study-tools"
import type { StudySet } from "./study-tools-types"

export function SavedStudyWorkspace({
  studySet,
  availableSourceIds,
  spaces,
  recentMaterials,
  userName,
  signOutAction,
  createSpaceAction,
}: {
  studySet: StudySet
  availableSourceIds: string[]
  spaces: StudySpace[]
  recentMaterials: RecentMaterial[]
  userName: string
  signOutAction: () => Promise<void>
  createSpaceAction: CreateSpaceAction
}) {
  const router = useRouter()
  const newSpace = useCreateSpace(createSpaceAction)
  return (
    <WorkspaceShell
      fixedContent
      title={studySet.title}
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={userName}
      signOutAction={signOutAction}
      onCreateSpace={() => void newSpace.createSpace()}
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
    >
      <main id="main-content" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-5 pb-8 sm:px-8">
          {studySet.sourceUnavailable && (
            <p className="py-3 text-sm text-muted-foreground">
              Original source removed · Your saved work is still available.
            </p>
          )}
          <StudyTools
            materialId={studySet.materialId ?? ""}
            ready={false}
            standaloneSet={studySet}
            availableSourceIds={availableSourceIds}
            onOpenCitation={(page) => {
              if (studySet.materialId)
                router.push(`/materials/${studySet.materialId}?page=${page}`)
            }}
          />
        </div>
      </main>
    </WorkspaceShell>
  )
}
