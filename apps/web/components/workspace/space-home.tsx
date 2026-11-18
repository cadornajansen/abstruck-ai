"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Book, Collapse, Emoji, Expand, MediaImage, Xmark } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { SpaceInlineField } from "./space-inline-field"
import { SpaceIconPicker } from "./space-icon-picker"
import { SpaceIcon } from "./space-icon"
import { SpaceCover } from "./space-cover"
import type { SpaceDetails, SpaceDetailsPatch } from "@/lib/space-appearance"
import { motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import {
  WorkspaceShell,
  MaterialComposer,
  type StudySpace,
  type RecentMaterial,
  type StartChatAction,
} from "@/components/workspace/study-home"
import {
  CollectionView,
  type MaterialListItem,
  type CollectionState,
} from "@/components/workspace/collection-view"
import {
  MaterialDialog,
  type MaterialInputKind,
  type MaterialDialogProps,
} from "@/components/workspace/material-dialog"
import type { CreateSpaceAction } from "@/components/workspace/create-space-dialog"
import { useCreateSpace } from "@/hooks/use-create-space"
import { ConnectedMaterial } from "@/components/connected-material"
import { AssessmentPage } from "./assessment-page"
import type { Tables } from "@/lib/supabase/database.types"
import type { ChatSourceOption } from "./chat-controls"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import {
  CreateFolderMenu,
  FolderActions,
  FolderNameEditor,
} from "./folder-actions"
import type { SpaceFolder } from "@/lib/organisation-types"

export interface SpaceHomeProps {
  space: StudySpace
  spaces: StudySpace[]
  recentMaterials?: RecentMaterial[]
  userName: string
  signOutAction: () => Promise<void>
  createSpaceAction?: CreateSpaceAction
  materials?: MaterialListItem[]
  folders?: SpaceFolder[]
  activeFolder?: SpaceFolder | null
  folderMaterials?: MaterialListItem[]
  materialState?: CollectionState
  onSubmitMaterial?: MaterialDialogProps["onSubmit"]
  onStartChat?: StartChatAction
  onDeleteMaterial?: (id: string) => Promise<void>
  studyMaterial?: Tables<"materials"> | null
  studySources?: ChatSourceOption[]
}

export function SpaceHome({
  space: initialSpace,
  spaces,
  recentMaterials,
  userName,
  signOutAction,
  createSpaceAction,
  materials = [],
  folders = [],
  activeFolder = null,
  folderMaterials = [],
  materialState = "ready",
  onSubmitMaterial,
  onStartChat,
  onDeleteMaterial,
  studyMaterial,
  studySources = [],
}: SpaceHomeProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const exam = searchParams.get("exam")
  const [retainedExam, setRetainedExam] = useState(exam)
  const examView = exam ?? retainedExam
  useEffect(() => {
    if (exam) setRetainedExam(exam)
  }, [exam])
  const [learnOpen, setLearnOpen] = useState(false)
  const [learnMounted, setLearnMounted] = useState(false)
  const [learnExpanded, setLearnExpanded] = useState(false)
  const learnButton = useRef<HTMLButtonElement>(null)
  const studyPanelId = useId()
  function changeExam(id: string | null, replace = false): void {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("exam", id)
    else url.searchParams.delete("exam")
    url.searchParams.delete("attempt")
    window.history[replace ? "replaceState" : "pushState"](null, "", url)
  }
  function toggleLearn(): void {
    setLearnMounted(true)
    setLearnExpanded(false)
    setLearnOpen((open) => !open)
    if (learnOpen) requestAnimationFrame(() => learnButton.current?.focus())
  }
  function toggleComposer(): void {
    if (exam) {
      changeExam(null)
      setComposerOpen(true)
    } else setComposerOpen((open) => !open)
  }
  const [space, setSpace] = useState(initialSpace)
  const currentSpace = useRef(initialSpace)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveError, setSaveError] = useState("")
  const [iconPicker, setIconPicker] = useState(false)
  const coverInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    currentSpace.current = initialSpace
    setSpace(initialSpace)
  }, [initialSpace])
  function busy(value: boolean): void {
    savingRef.current = value
    setSaving(value)
  }
  function changed(patch: Partial<SpaceDetails>): void {
    const next = { ...currentSpace.current, ...patch }
    currentSpace.current = next
    setSpace(next)
    router.refresh()
  }
  async function saveDetails(patch: SpaceDetailsPatch): Promise<void> {
    if (savingRef.current) throw new Error("A space change is being saved.")
    busy(true)
    setSaveError("")
    try {
      const response = await fetch(`/api/spaces/${space.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...patch,
          revision: currentSpace.current.detailsRevision ?? 0,
        }),
      })
      const result = (await response.json()) as {
        space: SpaceDetails
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? "Your space could not be saved.")
      changed(result.space)
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Your draft is still here."
      setSaveError(message)
      throw new Error(message)
    } finally {
      busy(false)
    }
  }
  const visibleSpaces = spaces.map((item) =>
    item.id === space.id ? { ...item, ...space } : item
  )
  const [kind, setKind] = useState<MaterialInputKind | null>(null)
  const [renamingFolder, setRenamingFolder] = useState(false)
  const [composerOpen, setComposerOpen] = useState(!activeFolder)
  const composerId = useId()
  const reducedMotion = useReducedMotion()
  const newSpace = useCreateSpace(createSpaceAction)
  useEffect(() => {
    setRenamingFolder(false)
    setComposerOpen(!activeFolder?.id)
  }, [space.id, activeFolder?.id])

  return (
    <WorkspaceShell
      fixedContent
      sidePanelOpen={learnOpen}
      sidePanelExpanded={learnOpen && learnExpanded}
      sidePanel={
        <aside
          id={studyPanelId}
          aria-label="Space study panel"
          className="flex h-full min-h-0 min-w-72 flex-col bg-background"
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close study panel"
              onClick={toggleLearn}
            >
              <Xmark />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                learnExpanded ? "Restore split view" : "Expand study panel"
              }
              aria-pressed={learnExpanded}
              onClick={() => setLearnExpanded((expanded) => !expanded)}
            >
              {learnExpanded ? <Collapse /> : <Expand />}
            </Button>
          </div>
          <div
            className={cn(
              "flex min-h-0 w-full flex-1 flex-col px-4 pb-3",
              learnExpanded && "mx-auto max-w-[960px]"
            )}
          >
            {learnMounted && studyMaterial ? (
              <ConnectedMaterial
                key={studyMaterial.id}
                embedded
                initialTab="learn"
                initialMaterial={studyMaterial}
                contextMaterials={studySources}
                spaces={visibleSpaces}
                userName={userName}
                signOutAction={signOutAction}
                createSpaceAction={createSpaceAction}
              />
            ) : learnOpen ? (
              <Empty className="flex-1 border-0">
                <EmptyHeader>
                  <EmptyTitle>Add your first material</EmptyTitle>
                  <EmptyDescription>
                    Your space's sources will be available here for chat and
                    study tools.
                  </EmptyDescription>
                </EmptyHeader>
                <Button
                  variant="outline"
                  onClick={() => {
                    setLearnOpen(false)
                    setComposerOpen(true)
                  }}
                >
                  Add content
                </Button>
              </Empty>
            ) : null}
          </div>
        </aside>
      }
      actions={
        <Button
          ref={learnButton}
          variant="outline"
          className="rounded-full"
          onClick={toggleLearn}
          aria-expanded={learnOpen}
          aria-controls={studyPanelId}
        >
          <Book data-icon="inline-start" />
          Learn
        </Button>
      }
      title={
        activeFolder ? (
          <span className="flex min-w-0 items-center gap-2">
            <Link
              href={`/spaces/${space.id}`}
              className="truncate text-muted-foreground hover:text-foreground"
            >
              {space.title}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">{activeFolder.title}</span>
          </span>
        ) : (
          <SpaceInlineField
            value={space.title}
            field="title"
            compact
            disabled={saving}
            onSave={(title) => saveDetails({ title })}
          />
        )
      }
      spaces={visibleSpaces}
      recentMaterials={recentMaterials}
      activeSpaceId={space.id}
      activeFolderId={activeFolder?.id}
      userName={userName}
      signOutAction={signOutAction}
      onAddMaterial={toggleComposer}
      onCreateSpace={
        createSpaceAction ? () => void newSpace.createSpace() : undefined
      }
      creatingSpace={newSpace.pending}
      createSpaceError={newSpace.error}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!activeFolder && (
          <SpaceCover
            space={space}
            inputRef={coverInput}
            disabled={saving}
            onBusyChange={busy}
            onChanged={changed}
          />
        )}
        <CollectionView
          splitView={learnOpen}
          kind="space"
          title={activeFolder?.title ?? space.title}
          description={space.description}
          hideDescription={!!activeFolder}
          spaces={visibleSpaces}
          folders={activeFolder ? [] : folders}
          folderMaterials={folderMaterials}
          emptyTitle={activeFolder ? "Add content to this folder" : undefined}
          titleEditor={
            activeFolder && renamingFolder ? (
              <FolderNameEditor
                folder={activeFolder}
                onCancel={() => setRenamingFolder(false)}
              />
            ) : !activeFolder ? (
              <div className="flex w-full flex-col items-start gap-2">
                {space.iconName && (
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="mb-1 size-12 rounded-xl"
                    aria-label="Change space icon"
                    disabled={saving}
                    onClick={() => setIconPicker(true)}
                  >
                    <SpaceIcon space={space} className="size-10!" />
                  </Button>
                )}
                <h1 className="w-full" aria-label={space.title}>
                  <SpaceInlineField
                    value={space.title}
                    field="title"
                    disabled={saving}
                    onSave={(title) => saveDetails({ title })}
                  />
                </h1>
              </div>
            ) : undefined
          }
          descriptionEditor={
            !activeFolder ? (
              <>
                <SpaceInlineField
                  value={space.description ?? ""}
                  field="description"
                  disabled={saving}
                  onSave={(description) => saveDetails({ description })}
                />
                {saveError && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-xs text-destructive"
                  >
                    <span>{saveError}</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        router.refresh()
                        setSaveError("")
                      }}
                    >
                      Reload saved details
                    </Button>
                  </div>
                )}
                {saving && (
                  <span role="status" className="sr-only">
                    Saving space details…
                  </span>
                )}
              </>
            ) : undefined
          }
          headerTools={
            !activeFolder ? (
              <div className="-ml-1 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within/collection-heading:opacity-100 group-hover/collection-heading:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setSaveError("")
                    setIconPicker(true)
                  }}
                  className="text-muted-foreground"
                >
                  <Emoji data-icon="inline-start" />
                  {space.iconName ? "Change icon" : "Add icon"}
                </Button>
                {!space.hasCover && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => coverInput.current?.click()}
                    className="text-muted-foreground"
                  >
                    <MediaImage data-icon="inline-start" />
                    Add cover
                  </Button>
                )}
              </div>
            ) : undefined
          }
          items={materials}
          onDelete={onDeleteMaterial}
          state={materialState}
          onAdd={toggleComposer}
          addContentExpanded={composerOpen && !exam}
          addContentControls={composerId}
          examAction={
            <Button
              variant="outline"
              className="h-10 rounded-2xl"
              aria-pressed={Boolean(exam)}
              onClick={() => changeExam(exam ? null : "new")}
            >
              <Book data-icon="inline-start" />
              {exam ? "Close Exam" : "New Exam"}
            </Button>
          }
          spaceActions={
            activeFolder ? (
              <FolderActions
                folder={activeFolder}
                spaces={visibleSpaces}
                onRename={() => setRenamingFolder(true)}
                navigateAfterMove
              />
            ) : (
              <CreateFolderMenu spaceId={space.id} />
            )
          }
          spaceComposer={
            <>
              {examView && (
                <motion.section
                  initial={false}
                  animate={{ height: exam ? "auto" : 0, opacity: exam ? 1 : 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.18,
                    ease: "easeOut",
                  }}
                  aria-hidden={!exam}
                  inert={!exam}
                  className="overflow-hidden rounded-3xl bg-card shadow-sm"
                >
                  <AssessmentPage
                    key={examView}
                    embedded
                    studySetId={examView === "new" ? undefined : examView}
                    initialAttemptId={searchParams.get("attempt") ?? undefined}
                    materialId={studyMaterial?.id ?? null}
                    sources={studySources}
                    sourceTitle={space.title}
                    initialSourceIds={
                      searchParams.has("sourceIds")
                        ? (searchParams.get("sourceIds") ?? "")
                            .split(",")
                            .filter((id) =>
                              studySources.some((source) => source.id === id)
                            )
                            .slice(0, 3)
                        : studySources.slice(0, 3).map((source) => source.id)
                    }
                    onBack={() => changeExam(null)}
                    onCreated={(id) => changeExam(id, true)}
                  />
                </motion.section>
              )}
              <motion.div
                id={composerId}
                initial={false}
                animate={{
                  height: composerOpen && !exam ? "auto" : 0,
                  opacity: composerOpen && !exam ? 1 : 0,
                  // Cancel the collection's gap-7 while the mounted card is closed.
                  marginTop: composerOpen && !exam ? 0 : -28,
                }}
                transition={{
                  duration: reducedMotion ? 0 : 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                inert={!composerOpen || Boolean(exam)}
                aria-hidden={!composerOpen || Boolean(exam)}
                className="overflow-hidden"
              >
                <section
                  className="flex min-h-[420px] flex-col items-center rounded-[24px] border bg-card px-5 py-20 shadow-sm sm:px-10"
                  aria-labelledby="space-composer-heading"
                >
                  <h2
                    id="space-composer-heading"
                    className="text-center text-xl leading-7 sm:text-3xl sm:leading-9"
                  >
                    Time to learn
                    {userName && userName !== "Your workspace"
                      ? `, ${userName}`
                      : ""}
                  </h2>
                  <div className="mt-8 w-full max-w-2xl">
                    <MaterialComposer
                      onChoose={setKind}
                      onStartChat={onStartChat}
                    />
                  </div>
                </section>
              </motion.div>
            </>
          }
        />
      </div>
      <MaterialDialog
        kind={kind}
        onClose={() => setKind(null)}
        onSubmit={onSubmitMaterial}
      />
      <SpaceIconPicker
        space={space}
        open={iconPicker}
        onOpenChange={setIconPicker}
        pending={saving}
        error={saveError}
        onSave={(icon) => saveDetails({ icon })}
      />
    </WorkspaceShell>
  )
}
