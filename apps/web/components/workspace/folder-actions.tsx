"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EditPencil, Folder, MoreVert, Trash } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"
import type { SpaceFolder } from "@/lib/organisation-types"
import type { StudySpace } from "./study-home"
import { InlineTitleEditor } from "./inline-title-editor"
import { MoveMenu, type MoveDestination } from "./move-menu"
import {
  OrganisationRequestError,
  organisationMessage,
  organisationRequest,
} from "./organisation-request"

export function CreateFolderMenu({ spaceId }: { spaceId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const requestId = useRef<string | null>(null)

  async function create() {
    if (inFlight.current) return
    inFlight.current = true
    requestId.current ??= crypto.randomUUID()
    setPending(true)
    setError("")
    try {
      await organisationRequest<{ folder: SpaceFolder }>(
        `/api/spaces/${spaceId}/folders`,
        {
          method: "POST",
          body: JSON.stringify({ requestId: requestId.current }),
        }
      )
      requestId.current = null
      router.refresh()
    } catch (cause) {
      setError(organisationMessage(cause))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-lg"
              className="rounded-2xl"
              aria-label={pending ? "Creating folder" : "More actions"}
              disabled={pending}
            />
          }
        >
          {pending ? <Spinner /> : <MoreVert />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void create()}>
              <Folder />
              New Folder
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="max-w-64 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function FolderNameEditor({
  folder,
  onCancel,
}: {
  folder: SpaceFolder
  onCancel: () => void
}) {
  const router = useRouter()
  const revision = useRef(folder.revision)
  useEffect(() => {
    revision.current = folder.revision
  }, [folder.revision])
  return (
    <InlineTitleEditor
      title={folder.title}
      maxLength={120}
      label="Folder name"
      onCancel={onCancel}
      onSave={async (title) => {
        try {
          await organisationRequest<{ folder: SpaceFolder }>(
            `/api/folders/${folder.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({ title, revision: revision.current }),
            }
          )
          router.refresh()
        } catch (cause) {
          if (cause instanceof OrganisationRequestError && cause.folder) {
            revision.current = cause.folder.revision
            router.refresh()
            throw new OrganisationRequestError(
              `${cause.message} Current name: ${cause.folder.title}.`,
              cause.status,
              cause.folder
            )
          }
          throw cause
        }
      }}
    />
  )
}

export function FolderActions({
  folder,
  spaces,
  onRename,
  navigateAfterMove = false,
  className,
}: {
  folder: SpaceFolder
  spaces: StudySpace[]
  onRename: () => void
  navigateAfterMove?: boolean
  className?: string
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const renameAfterClose = useRef(false)
  const revision = useRef(folder.revision)
  useEffect(() => {
    revision.current = folder.revision
  }, [folder.revision])

  function failed(cause: unknown) {
    if (cause instanceof OrganisationRequestError && cause.folder) {
      revision.current = cause.folder.revision
      router.refresh()
    }
    setError(organisationMessage(cause))
  }

  async function move(destination: MoveDestination) {
    if (inFlight.current || !destination.spaceId) return
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      const result = await organisationRequest<{
        folder: SpaceFolder
        movedMaterialCount: number
      }>(`/api/folders/${folder.id}/location`, {
        method: "PATCH",
        body: JSON.stringify({
          spaceId: destination.spaceId,
          revision: revision.current,
        }),
      })
      revision.current = result.folder.revision
      setMenuOpen(false)
      if (navigateAfterMove)
        router.push(
          `/spaces/${result.folder.spaceId}?folderId=${result.folder.id}`
        )
      else router.refresh()
    } catch (cause) {
      failed(cause)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  async function remove() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      await organisationRequest<{
        deleted: true
        spaceId: string
        unfiledCount: number
      }>(`/api/folders/${folder.id}`, {
        method: "DELETE",
        body: JSON.stringify({ revision: revision.current }),
      })
      setDeleting(false)
      if (navigateAfterMove) router.push(`/spaces/${folder.spaceId}`)
      else router.refresh()
    } catch (cause) {
      failed(cause)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <>
      <DropdownMenu
        modal={false}
        open={menuOpen}
        onOpenChange={(open) => {
          if (open) renameAfterClose.current = false
          setMenuOpen(open)
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${folder.title}`}
              className={className}
              disabled={pending}
            />
          }
        >
          {pending ? <Spinner /> : <MoreVert />}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          finalFocus={() =>
            renameAfterClose.current || deleting ? false : true
          }
          className="w-48"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                renameAfterClose.current = true
                setMenuOpen(false)
                onRename()
              }}
            >
              <EditPencil />
              Rename
            </DropdownMenuItem>
            <MoveMenu
              spaces={spaces}
              current={{ spaceId: folder.spaceId, folderId: null }}
              folders={false}
              disabled={pending}
              onMove={(destination) => void move(destination)}
            />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setError("")
                setDeleting(true)
              }}
            >
              <Trash />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && !deleting && (
        <p role="alert" className="max-w-64 px-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={deleting}
        onOpenChange={(open) => {
          if (!pending) setDeleting(open)
        }}
      >
        <DialogContent
          className="rounded-[12px] p-6 sm:max-w-md"
          showCloseButton={!pending}
        >
          <DialogHeader>
            <DialogTitle>Delete this folder?</DialogTitle>
            <DialogDescription>
              {folder.title} will be removed. Its materials will stay in the
              space, with their files and study history.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => void remove()}
            >
              {pending && <Spinner />}Delete folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
