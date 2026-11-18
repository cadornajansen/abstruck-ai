"use client"

import { AssessmentPage, type AssessmentPageProps } from "./assessment-page"
import {
  WorkspaceShell,
  type StudySpace,
  type RecentMaterial,
} from "./study-home"
import type { CreateSpaceAction } from "./create-space-dialog"
import { useCreateSpace } from "@/hooks/use-create-space"

export function AssessmentWorkspace({
  assessment,
  spaces,
  recentMaterials,
  userName,
  signOutAction,
  createSpaceAction,
}: {
  assessment: AssessmentPageProps
  spaces: StudySpace[]
  recentMaterials: RecentMaterial[]
  userName: string
  signOutAction: () => Promise<void>
  createSpaceAction: CreateSpaceAction
}) {
  const newSpace = useCreateSpace(createSpaceAction)
  return (
    <WorkspaceShell
      fixedContent
      title="Exam"
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={userName}
      signOutAction={signOutAction}
      onCreateSpace={() => void newSpace.createSpace()}
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
    >
      <AssessmentPage {...assessment} embedded />
    </WorkspaceShell>
  )
}
