"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Book } from "iconoir-react"
import { buttonVariants } from "@workspace/ui/components/button"
import type { StudySet } from "./study-tools-types"
import {
  WorkspaceShell,
  type StudySpace,
  type RecentMaterial,
} from "@/components/workspace/study-home"
import {
  CollectionView,
  type MaterialListItem,
} from "@/components/workspace/collection-view"
import {
  MaterialDialog,
  type MaterialDraft,
  type MaterialInputKind,
} from "@/components/workspace/material-dialog"
import type { CreateSpaceAction } from "@/components/workspace/create-space-dialog"
import { useCreateSpace } from "@/hooks/use-create-space"
import { organisationRequest } from "./organisation-request"
import type { UploadOptions } from "@/lib/file-upload"
import {
  importPastedText,
  importYouTube,
  uploadMaterial,
} from "@/lib/upload-material"

export function LibraryScreen({
  kind,
  items,
  spaces,
  recentMaterials,
  userName,
  signOutAction,
  createSpaceAction,
  defaultSearchOpen = false,
  unfiledOnly = false,
  preservedSets = [],
}: {
  kind: "library" | "history"
  items: MaterialListItem[]
  spaces: StudySpace[]
  recentMaterials: RecentMaterial[]
  userName: string
  signOutAction: () => Promise<void>
  createSpaceAction: CreateSpaceAction
  defaultSearchOpen?: boolean
  unfiledOnly?: boolean
  preservedSets?: StudySet[]
}) {
  const router = useRouter()
  const [materialDialog, setMaterialDialog] =
    useState<MaterialInputKind | null>(null)
  const newSpace = useCreateSpace(createSpaceAction)
  async function deleteMaterial(id: string): Promise<void> {
    await organisationRequest<unknown>(`/api/materials/${id}`, {
      method: "DELETE",
    })
    router.refresh()
  }
  async function upload(
    draft: MaterialDraft,
    options?: UploadOptions
  ): Promise<{ error?: string }> {
    try {
      const { materialId } =
        draft.kind === "link"
          ? await importYouTube(draft.url, null)
          : draft.kind === "paste"
            ? await importPastedText(draft.text, null)
            : await uploadMaterial(draft.file, null, null, options)
      router.push(`/materials/${materialId}`)
      router.refresh()
      return {}
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Upload was interrupted. Please try again.",
      }
    }
  }
  return (
    <WorkspaceShell
      defaultSearchOpen={defaultSearchOpen}
      spaces={spaces}
      recentMaterials={recentMaterials}
      userName={userName}
      signOutAction={signOutAction}
      onAddMaterial={() => setMaterialDialog("upload")}
      onCreateSpace={() => void newSpace.createSpace()}
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
    >
      <CollectionView
        kind={kind}
        items={items}
        spaces={spaces}
        state={items.length ? "ready" : "empty"}
        onAdd={() => setMaterialDialog("upload")}
        onDelete={deleteMaterial}
        description={
          kind === "history"
            ? "Materials you’ve opened, with your saved reading position."
            : unfiledOnly
              ? "Materials saved outside spaces."
              : undefined
        }
      />
      {preservedSets.length > 0 && (
        <section
          id="saved-study-sets"
          aria-labelledby="saved-study-heading"
          className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 pb-10 lg:px-16"
        >
          <h2 id="saved-study-heading" className="text-lg">
            Saved study sets
          </h2>
          <div className="flex flex-col gap-1">
            {preservedSets.map((set) => (
              <Link
                key={set.id}
                href={`/study/${set.id}`}
                className={buttonVariants({
                  variant: "ghost",
                  className:
                    "h-auto justify-start gap-3 rounded-xl px-3 py-3 text-left",
                })}
              >
                <Book data-icon="inline-start" />
                <span className="min-w-0 flex-1 truncate">{set.title}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {set.type.replaceAll("-", " ")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <MaterialDialog
        kind={materialDialog}
        onClose={() => setMaterialDialog(null)}
        onSubmit={upload}
      />
    </WorkspaceShell>
  )
}
