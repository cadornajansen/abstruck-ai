"use client"

import { Book, Check, Folder } from "iconoir-react"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type { StudySpace } from "./study-home"

export interface MoveDestination {
  spaceId: string | null
  folderId: string | null
}

export function MoveMenu({
  spaces,
  current,
  folders = true,
  disabled,
  onMove,
}: {
  spaces: StudySpace[]
  current: MoveDestination
  folders?: boolean
  disabled?: boolean
  onMove: (destination: MoveDestination) => void
}) {
  const destinations = folders
    ? spaces
    : spaces.filter((space) => space.id !== current.spaceId)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <Folder />
        Move to space
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          {folders && (
            <DropdownMenuItem
              disabled={disabled || current.spaceId === null}
              onClick={() => onMove({ spaceId: null, folderId: null })}
            >
              <Book />
              <span className="min-w-0 flex-1 truncate">My Library</span>
              {current.spaceId === null && <Check />}
            </DropdownMenuItem>
          )}
          {destinations.map((space) => {
            const nested = folders ? (space.folders ?? []) : []
            const atRoot =
              current.spaceId === space.id && current.folderId === null
            return nested.length ? (
              <DropdownMenuSub key={space.id}>
                <DropdownMenuSubTrigger
                  disabled={disabled}
                  onClick={() => {
                    if (!atRoot) onMove({ spaceId: space.id, folderId: null })
                  }}
                >
                  <Folder />
                  <span className="min-w-0 flex-1 truncate">{space.title}</span>
                  {atRoot && <Check />}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56 max-w-[calc(100vw-2rem)]">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{space.title}</DropdownMenuLabel>
                    {nested.map((folder) => (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={disabled || folder.id === current.folderId}
                        onClick={() =>
                          onMove({ spaceId: space.id, folderId: folder.id })
                        }
                      >
                        <Folder />
                        <span className="min-w-0 flex-1 truncate">
                          {folder.title}
                        </span>
                        {folder.id === current.folderId && <Check />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                key={space.id}
                disabled={disabled || atRoot}
                onClick={() => onMove({ spaceId: space.id, folderId: null })}
              >
                <Folder />
                <span className="min-w-0 flex-1 truncate">{space.title}</span>
                {atRoot && <Check />}
              </DropdownMenuItem>
            )
          })}
          {!destinations.length && !folders && (
            <DropdownMenuLabel>No other spaces yet</DropdownMenuLabel>
          )}
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
