"use client"

import { useEffect, useState, type ReactElement, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  EditPencil,
  MoreVert,
  NavArrowDown,
  NavArrowUp,
  Pin,
  PinSlash,
  ShareAndroid,
  Trash,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import { ShareOutputAction } from "./sharing-dialog"
import type { StudySpace } from "./study-home"

type SpaceOutput = { id: string; title: string; type: string }

type SpaceOrganisationActions = {
  onTogglePin?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  pending?: boolean
}

function SpaceActionItems({
  context = false,
  space,
  onOpen,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  pending = false,
}: SpaceOrganisationActions & {
  context?: boolean
  space: StudySpace
  onOpen: (mode: "edit" | "delete" | "share") => void
}) {
  const Group = context ? ContextMenuGroup : DropdownMenuGroup
  const Item = context ? ContextMenuItem : DropdownMenuItem
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator
  return (
    <>
      {onTogglePin && (
        <>
          <Group>
            <Item disabled={pending} onClick={onTogglePin}>
              {space.isPinned ? (
                <PinSlash aria-hidden="true" />
              ) : (
                <Pin aria-hidden="true" />
              )}
              {space.isPinned ? "Unpin" : "Pin"}
            </Item>
            <Item disabled={pending || !onMoveUp} onClick={onMoveUp}>
              <NavArrowUp aria-hidden="true" /> Move up
            </Item>
            <Item disabled={pending || !onMoveDown} onClick={onMoveDown}>
              <NavArrowDown aria-hidden="true" /> Move down
            </Item>
          </Group>
          <Separator />
        </>
      )}
      <Group>
        <Item disabled={pending} onClick={() => onOpen("share")}>
          <ShareAndroid aria-hidden="true" /> Share
        </Item>
        <Item disabled={pending} onClick={() => onOpen("edit")}>
          <EditPencil aria-hidden="true" /> Edit
        </Item>
        <Item disabled={pending} onClick={() => onOpen("delete")}>
          <Trash aria-hidden="true" /> Delete
        </Item>
      </Group>
    </>
  )
}

export function SpaceActions({
  space,
  className,
  children,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  pending: organising = false,
}: SpaceOrganisationActions & {
  space: StudySpace
  className?: string
  children?: (menu: ReactNode) => ReactElement
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [mode, setMode] = useState<"edit" | "delete" | "share" | null>(null)
  const [title, setTitle] = useState(space.title)
  const [description, setDescription] = useState(space.description ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [outputs, setOutputs] = useState<SpaceOutput[]>([])
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)

  function open(next: "edit" | "delete" | "share") {
    setMenuOpen(false)
    setContextOpen(false)
    setError("")
    setTitle(space.title)
    setDescription(space.description ?? "")
    setMode(next)
  }

  useEffect(() => {
    if (mode !== "share") return
    const controller = new AbortController()
    setLoading(true)
    setOutputs([])
    setError("")
    void fetch(`/api/spaces/${space.id}/outputs`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(
            result.error ?? "Your saved work could not be loaded."
          )
        if (!controller.signal.aborted) setOutputs(result.outputs)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Your saved work could not be loaded."
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [mode, space.id, reload])

  async function save(remove = false): Promise<void> {
    if (pending) return
    setPending(true)
    setError("")
    try {
      const response = await fetch(`/api/spaces/${space.id}`, {
        method: remove ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: remove
          ? undefined
          : JSON.stringify({
              title,
              description,
              revision: space.detailsRevision ?? 0,
            }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Your space could not be updated.")
      setMode(null)
      if (remove && pathname === `/spaces/${space.id}`) router.push("/")
      router.refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t connect. Please try again."
      )
    } finally {
      setPending(false)
    }
  }

  function organise(
    action: (() => void) | undefined
  ): (() => void) | undefined {
    if (!action) return undefined
    return () => {
      setMenuOpen(false)
      setContextOpen(false)
      action()
    }
  }

  const menuItems = {
    space,
    onOpen: open,
    onTogglePin: organise(onTogglePin),
    onMoveUp: organise(onMoveUp),
    onMoveDown: organise(onMoveDown),
    pending: pending || organising,
  }
  const dropdown = (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(value) => {
        setMenuOpen(value)
        if (value) setContextOpen(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={className}
            disabled={pending || organising}
            aria-label={`Options for ${space.title}`}
          />
        }
      >
        <MoreVert aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-48 rounded-2xl p-1.5"
        finalFocus={mode ? false : undefined}
      >
        <SpaceActionItems {...menuItems} />
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      {children ? (
        <ContextMenu
          open={contextOpen}
          onOpenChange={(value) => {
            setContextOpen(value)
            if (value) setMenuOpen(false)
          }}
        >
          <ContextMenuTrigger render={children(dropdown)} />
          <ContextMenuContent
            className="w-48 rounded-2xl p-1.5"
            finalFocus={mode ? false : undefined}
          >
            <SpaceActionItems {...menuItems} context />
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        dropdown
      )}

      <Dialog
        open={mode === "edit"}
        onOpenChange={(value) => {
          if (!value && !pending) setMode(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit space</DialogTitle>
            <DialogDescription>
              Update the name and description.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
            className="flex flex-col gap-5"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`space-title-${space.id}`}>
                  Name
                </FieldLabel>
                <Input
                  id={`space-title-${space.id}`}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  required
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`space-description-${space.id}`}>
                  Description
                </FieldLabel>
                <Textarea
                  id={`space-description-${space.id}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  disabled={pending}
                />
              </Field>
            </FieldGroup>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !title.trim()}>
                {pending && <Spinner />} Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={mode === "delete"}
        onOpenChange={(value) => {
          if (!value && !pending) setMode(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{space.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The space will be removed. Its materials and saved study sets stay
              in your library, with their study history intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void save(true)}
              disabled={pending}
            >
              {pending && <Spinner />} Delete space
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={mode === "share"}
        onOpenChange={(value) => {
          if (!value) setMode(null)
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share from {space.title}</DialogTitle>
            <DialogDescription>
              Choose a saved output to share. Conversations stay private. You
              can review exactly what will be visible before creating a link.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {loading ? (
              <p
                role="status"
                className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
              >
                <Spinner /> Loading saved outputs…
              </p>
            ) : error ? (
              <>
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setReload((value) => value + 1)}
                >
                  Try again
                </Button>
              </>
            ) : outputs.length ? (
              outputs.map((output) => (
                <div
                  key={output.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{output.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {output.type}
                    </p>
                  </div>
                  <ShareOutputAction studySetId={output.id} />
                </div>
              ))
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                No saved outputs yet. Create a note, summary, flashcard set,
                quiz or exam from a material first.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
