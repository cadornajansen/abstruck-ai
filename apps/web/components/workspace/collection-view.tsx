"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react"
import {
  Book,
  Folder,
  MoreVert,
  NavArrowDown,
  Plus,
  Search,
  ViewGrid,
  List,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { FieldGroup, Field, FieldLabel } from "@workspace/ui/components/field"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { MaterialCard, MaterialListRow } from "./material-card"
import type { StudySpace } from "./study-home"
import type { SpaceFolder } from "@/lib/organisation-types"
import { FolderCard, FolderTableGroup } from "./folder-collection"
import { organisationMessage } from "./organisation-request"

export interface MaterialListItem {
  id: string
  title: string
  detail: string
  space: string
  href: string
  createdAt?: string
  previewUrl?: string
  sourceType?: string
  spaceId?: string | null
  folderId?: string | null
  locationRevision?: number
  status?: string
}
export type CollectionState = "ready" | "empty" | "loading" | "error"

function CollectionLayout({
  children,
  reducedMotion,
}: {
  children: ReactNode
  reducedMotion: boolean
}) {
  const present = useIsPresent()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeOut" }}
      inert={!present}
      aria-hidden={!present}
      className={cn(
        "w-full",
        !present && "pointer-events-none absolute inset-x-0 top-0"
      )}
    >
      {children}
    </motion.div>
  )
}

export function CollectionSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading materials"
      className="flex flex-col gap-8"
    >
      <Skeleton className="h-9 w-52" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-3xl border p-4"
          >
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your materials…</span>
    </div>
  )
}

export function CollectionView({
  kind,
  items,
  state = "ready",
  onAdd,
  onRetry,
  onCreateFolder,
  onRename,
  onDelete,
  title: customTitle,
  description,
  spaceComposer,
  spaceActions,
  spaces,
  folders = [],
  folderMaterials = [],
  titleEditor,
  descriptionEditor,
  headerTools,
  hideDescription = false,
  emptyTitle,
  addContentExpanded,
  addContentControls,
  examAction,
  splitView = false,
}: {
  kind: "space" | "library" | "history" | "search"
  items: MaterialListItem[]
  state?: CollectionState
  onAdd: () => void
  onRetry?: () => void
  onCreateFolder?: (name: string) => void
  onRename?: (name: string) => void
  onDelete?: (id: string) => Promise<void>
  title?: string
  description?: string | null
  spaceComposer?: ReactNode
  spaceActions?: ReactNode
  spaces?: StudySpace[]
  folders?: SpaceFolder[]
  folderMaterials?: MaterialListItem[]
  titleEditor?: ReactNode
  descriptionEditor?: ReactNode
  headerTools?: ReactNode
  hideDescription?: boolean
  emptyTitle?: string
  addContentExpanded?: boolean
  addContentControls?: string
  examAction?: ReactNode
  splitView?: boolean
}) {
  const [query, setQuery] = useState("")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const reducedMotion = !!useReducedMotion()
  const selectorId = useId()
  const layoutKey = `abstruck:collection-layout:v1:${kind}`
  useEffect(() => {
    try {
      setLayout(localStorage.getItem(layoutKey) === "list" ? "list" : "grid")
    } catch {
      /* View switching remains available without stored preferences. */
    }
  }, [layoutKey])
  const [nameAction, setNameAction] = useState<"folder" | "rename" | null>(null)
  const [name, setName] = useState("")
  const [deleting, setDeleting] = useState<MaterialListItem | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const deletePendingRef = useRef(false)
  const [deleteError, setDeleteError] = useState("")

  function selectDeletion(item: MaterialListItem): void {
    if (deletePendingRef.current) return
    setDeleteError("")
    setDeleting(item)
  }

  async function deleteMaterial(): Promise<void> {
    if (!deleting || !onDelete || deletePendingRef.current) return
    deletePendingRef.current = true
    setDeletePending(true)
    setDeleteError("")
    try {
      await onDelete(deleting.id)
      setDeleting(null)
    } catch (cause) {
      setDeleteError(organisationMessage(cause))
    } finally {
      deletePendingRef.current = false
      setDeletePending(false)
    }
  }
  const title =
    customTitle ??
    {
      space: "My study space",
      library: "My Library",
      history: "History",
      search: "Search",
    }[kind]
  const filtered = items.filter((item) =>
    `${item.title} ${item.space}`.toLowerCase().includes(query.toLowerCase())
  )
  const filteredFolders = folders.filter((folder) =>
    folder.title.toLowerCase().includes(query.toLowerCase())
  )
  const empty =
    !filteredFolders.length && (state === "empty" || !filtered.length)
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        "mx-auto flex max-w-7xl flex-col gap-7 px-6 py-8 lg:px-16",
        kind === "space" && "w-full max-w-[1168px] lg:w-[73%] lg:px-0 lg:py-16",
        kind === "space" && splitView && "lg:w-[92%] lg:py-10"
      )}
    >
      {state === "loading" ? (
        <CollectionSkeleton />
      ) : (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="group/collection-heading flex min-w-0 flex-1 flex-col gap-1">
              {headerTools}
              {titleEditor ?? (
                <h1 className="text-3xl tracking-tight">{title}</h1>
              )}
              {descriptionEditor ??
                (!hideDescription && (
                  <p className="text-sm text-muted-foreground">
                    {description ||
                      (kind === "space"
                        ? "No description"
                        : kind === "history"
                          ? "Pick up where you left off."
                          : "All your learning materials, in one place.")}
                  </p>
                ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {examAction}
              <Button
                variant={kind === "space" ? "default" : "outline"}
                className="h-10 rounded-2xl"
                onClick={onAdd}
                aria-expanded={addContentExpanded}
                aria-controls={addContentControls}
              >
                <Plus data-icon="inline-start" />
                Add Content
              </Button>
              {kind === "space" && spaceActions}
              {kind === "space" && (onCreateFolder || onRename) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-lg"
                        aria-label="More space actions"
                      />
                    }
                  >
                    <MoreVert />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        disabled={!onCreateFolder}
                        onClick={() => {
                          setName("")
                          setNameAction("folder")
                        }}
                      >
                        <Folder />
                        New Folder
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!onRename}
                        onClick={() => {
                          setName(title)
                          setNameAction("rename")
                        }}
                      >
                        Rename space
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <ToggleGroup
                value={[layout]}
                onValueChange={(values) => {
                  const next = values[0]
                  if (next !== "grid" && next !== "list") return
                  setLayout(next)
                  try {
                    localStorage.setItem(layoutKey, next)
                  } catch {
                    /* The selected view still stays active in this page. */
                  }
                }}
                aria-label="Material layout"
                className="h-10 rounded-full bg-muted/60 p-1"
                spacing={0}
              >
                {(["list", "grid"] as const).map((view) => (
                  <ToggleGroupItem
                    key={view}
                    value={view}
                    aria-label={view === "list" ? "List view" : "Grid view"}
                    className="relative h-8 w-11 min-w-11 rounded-full! px-0! text-muted-foreground hover:bg-transparent aria-pressed:bg-transparent! aria-pressed:text-foreground"
                  >
                    {layout === view && (
                      <motion.span
                        aria-hidden="true"
                        layoutId={
                          reducedMotion ? undefined : `${selectorId}-selection`
                        }
                        transition={{
                          duration: reducedMotion ? 0 : 0.16,
                          ease: "easeOut",
                        }}
                        className="absolute inset-0 rounded-full bg-background"
                      />
                    )}
                    {view === "list" ? (
                      <List className="relative" />
                    ) : (
                      <ViewGrid className="relative" />
                    )}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </header>
          {kind === "space" && spaceComposer}
          {kind !== "space" && (
            <InputGroup className="max-w-md rounded-xl">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search your materials"
                aria-label="Search your materials"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
          )}
          {state === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>Your materials couldn’t load</AlertTitle>
              <AlertDescription>
                <p>
                  Your saved work is still there. Check your connection and try
                  again.
                </p>
                <Button variant="outline" onClick={onRetry}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : empty &&
            kind === "space" &&
            spaceComposer &&
            addContentExpanded !== false &&
            !query ? null : empty ? (
            <Empty className="min-h-72 rounded-3xl border">
              <EmptyHeader>
                <Book className="mx-auto size-8 text-muted-foreground" />
                <EmptyTitle>
                  {query
                    ? "No matches found"
                    : (emptyTitle ?? "Add content to start learning")}
                </EmptyTitle>
                <EmptyDescription>
                  {query
                    ? "Try a different title or space name."
                    : "Upload documents, paste your notes or add a YouTube video."}
                </EmptyDescription>
              </EmptyHeader>
              {query ? (
                <Button variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              ) : (
                <Button variant="outline" onClick={onAdd}>
                  <Plus data-icon="inline-start" />
                  Add content
                </Button>
              )}
            </Empty>
          ) : (
            <section className="relative min-w-0">
              <AnimatePresence initial={false} mode="sync">
                <CollectionLayout key={layout} reducedMotion={reducedMotion}>
                  {layout === "list" ? (
                    <Table
                      className="table-fixed"
                      aria-label="Learning materials"
                    >
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-4 font-normal text-muted-foreground">
                            Name
                          </TableHead>
                          <TableHead className="w-[120px] px-3 font-normal text-muted-foreground sm:w-[180px]">
                            Added On{" "}
                            <NavArrowDown
                              aria-hidden="true"
                              className="inline size-3.5"
                            />
                          </TableHead>
                          <TableHead className="w-10">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      {filteredFolders.map((folder) => (
                        <FolderTableGroup
                          key={folder.id}
                          folder={folder}
                          spaces={spaces ?? []}
                          materials={folderMaterials.filter(
                            (item) => item.folderId === folder.id
                          )}
                          onDelete={onDelete ? selectDeletion : undefined}
                        />
                      ))}
                      <TableBody>
                        {filtered.map((item) => (
                          <MaterialListRow
                            key={item.id}
                            item={item}
                            spaces={spaces}
                            onDelete={
                              onDelete ? () => selectDeletion(item) : undefined
                            }
                          />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {kind === "space" && (
                        <p className="text-sm text-muted-foreground">
                          Added On ↓
                        </p>
                      )}
                      {filteredFolders.length > 0 && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,221px)]">
                          {filteredFolders.map((folder) => (
                            <FolderCard
                              key={folder.id}
                              folder={folder}
                              spaces={spaces ?? []}
                            />
                          ))}
                        </div>
                      )}
                      <div
                        className={cn(
                          "gap-4",
                          kind === "space"
                            ? "grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,277px)]"
                            : "grid sm:grid-cols-2 xl:grid-cols-3"
                        )}
                      >
                        {filtered.map((item) => (
                          <MaterialCard
                            key={item.id}
                            item={item}
                            spaces={spaces}
                            variant={kind === "space" ? "preview" : "icon"}
                            onDelete={
                              onDelete ? () => selectDeletion(item) : undefined
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CollectionLayout>
              </AnimatePresence>
            </section>
          )}
        </>
      )}
      <Dialog
        open={nameAction !== null}
        onOpenChange={(open) => {
          if (!open) setNameAction(null)
        }}
      >
        <DialogContent className="rounded-3xl p-6 sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {nameAction === "folder" ? "New folder" : "Rename space"}
            </DialogTitle>
            <DialogDescription>
              Choose a name that makes your materials easy to find.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim()) return
              if (nameAction === "folder") onCreateFolder?.(name.trim())
              else onRename?.(name.trim())
              setNameAction(null)
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="collection-name">Name</FieldLabel>
                <Input
                  id="collection-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  className="h-11 rounded-xl"
                />
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="h-11 rounded-xl"
            >
              {nameAction === "folder" ? "Create folder" : "Save"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open, details) => {
          if (deletePendingRef.current) {
            details.cancel()
            return
          }
          if (!open) {
            setDeleting(null)
            setDeleteError("")
          }
        }}
      >
        <AlertDialogContent
          className="w-[calc(100%-2rem)] max-w-[500px] rounded-3xl p-6 sm:max-w-[500px]"
          aria-busy={deletePending}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this material?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title} will be removed from your library. Related
              source links will no longer open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <AlertDialogCancel disabled={deletePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePending || !onDelete}
              onClick={() => void deleteMaterial()}
            >
              {deletePending && <Spinner />}
              {deletePending
                ? "Deleting…"
                : deleteError
                  ? "Retry deletion"
                  : "Delete material"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
