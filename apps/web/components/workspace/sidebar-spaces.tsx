"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react"
import { NavArrowDown, Pin } from "iconoir-react"
import { SpaceIcon } from "./space-icon"
import { Grip } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import { SpaceActions } from "./space-actions"
import { SpaceContentsNavigation } from "./space-contents-navigation"
import {
  organisationMessage,
  organisationRequest,
} from "./organisation-request"
import type { RecentMaterial, StudySpace } from "./study-home"

type SpacePreference = Pick<StudySpace, "id" | "isPinned" | "sortOrder">

interface SidebarSpacesProps {
  spaces: StudySpace[]
  recentMaterials: RecentMaterial[]
  activeSpaceId?: string | null
  activeFolderId?: string | null
  activeMaterialId?: string
  onNavigate?: () => void
  preview?: boolean
}

function spaceGroup(spaces: StudySpace[], pinned: boolean): StudySpace[] {
  return spaces.filter((space) => Boolean(space.isPinned) === pinned)
}

function orderGroup(
  spaces: StudySpace[],
  pinned: boolean,
  ids: string[]
): StudySpace[] {
  const group = new Map(
    spaceGroup(spaces, pinned).map((space) => [space.id, space])
  )
  const reordered = ids.flatMap((id) => {
    const space = group.get(id)
    return space ? [space] : []
  })
  const other = spaceGroup(spaces, !pinned)
  return pinned ? [...reordered, ...other] : [...other, ...reordered]
}

function SidebarSpaceRow({
  space,
  spaces,
  recentMaterials,
  activeFolderId,
  activeMaterialId,
  onNavigate,
  open,
  onOpenChange,
  pending,
  preview,
  onPin,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
}: Omit<SidebarSpacesProps, "activeSpaceId"> & {
  space: StudySpace
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onPin: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const controls = useDragControls()
  const reduceMotion = useReducedMotion()
  const row = (actions?: ReactNode) => (
    <div className="group/space-row flex items-center rounded-xl hover:bg-sidebar-accent has-[:focus-visible]:bg-sidebar-accent">
      <CollapsibleTrigger
        render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}
        aria-label={`${open ? "Collapse" : "Expand"} ${space.title}`}
      >
        <SpaceIcon
          space={space}
          className={cn(
            open
              ? "hidden"
              : "group-hover/space-row:hidden group-has-[:focus-visible]/space-row:hidden"
          )}
        />
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className={cn(
            "items-center justify-center",
            open
              ? "flex"
              : "hidden group-hover/space-row:flex group-has-[:focus-visible]/space-row:flex"
          )}
        >
          <NavArrowDown />
        </motion.span>
      </CollapsibleTrigger>
      <SidebarMenuButton
        render={
          <a
            href={`/spaces/${encodeURIComponent(space.id)}`}
            onClick={onNavigate}
          />
        }
        className="h-9 min-w-0 flex-1 rounded-xl pl-0"
      >
        <span className="truncate">{space.title}</span>
        {space.isPinned && (
          <Pin
            aria-label="Pinned"
            className="ml-auto shrink-0 text-muted-foreground"
          />
        )}
      </SidebarMenuButton>
      {!preview && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Drag ${space.title} to reorder`}
          disabled={pending}
          className="size-6 shrink-0 cursor-grab touch-none opacity-0 group-hover/space-row:opacity-100 group-has-[:focus-visible]/space-row:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-100"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.stopPropagation()
            if (!pending) controls.start(event)
          }}
        >
          <Grip aria-hidden="true" strokeWidth={1.8} />
        </Button>
      )}
      {actions}
    </div>
  )
  return (
    <Reorder.Item
      as="li"
      value={space.id}
      layout="position"
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      className="group/menu-item relative list-none"
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        {preview ? (
          row()
        ) : (
          <SpaceActions
            space={space}
            pending={pending}
            onTogglePin={onPin}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            className="shrink-0 opacity-0 group-hover/space-row:opacity-100 group-has-[:focus-visible]/space-row:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
          >
            {row}
          </SpaceActions>
        )}
        <CollapsibleContent
          keepMounted
          render={
            <motion.div
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.18,
                ease: "easeOut",
              }}
              className="overflow-hidden"
            />
          }
        >
          <SpaceContentsNavigation
            space={space}
            spaces={spaces}
            materials={recentMaterials.filter(
              (material) => material.spaceId === space.id
            )}
            activeMaterialId={activeMaterialId}
            activeFolderId={activeFolderId}
            onNavigate={onNavigate}
          />
        </CollapsibleContent>
      </Collapsible>
    </Reorder.Item>
  )
}

export function SidebarSpaces({
  spaces,
  activeSpaceId,
  ...props
}: SidebarSpacesProps) {
  const router = useRouter()
  const [items, setItems] = useState(spaces)
  const itemsRef = useRef(spaces)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const dragStart = useRef<string[] | null>(null)
  const [error, setError] = useState("")

  function update(next: StudySpace[]): void {
    itemsRef.current = next
    setItems(next)
  }

  useEffect(() => {
    if (!pendingRef.current && !dragStart.current) {
      itemsRef.current = spaces
      setItems(spaces)
    }
  }, [spaces])

  async function saveOrder(pinned: boolean, ids: string[]): Promise<void> {
    if (pendingRef.current || props.preview) return
    pendingRef.current = true
    setPending(true)
    setError("")
    try {
      const result = await organisationRequest<{ spaces: SpacePreference[] }>(
        "/api/spaces/order",
        {
          method: "PATCH",
          body: JSON.stringify({ pinned, spaceIds: ids }),
        }
      )
      const preferences = new Map(
        result.spaces.map((space) => [space.id, space])
      )
      update(
        itemsRef.current.map((space) => ({
          ...space,
          ...preferences.get(space.id),
        }))
      )
    } catch (cause) {
      update(spaces)
      setError(organisationMessage(cause))
    } finally {
      pendingRef.current = false
      setPending(false)
      router.refresh()
    }
  }

  async function pin(space: StudySpace): Promise<void> {
    if (pendingRef.current || props.preview) return
    pendingRef.current = true
    setPending(true)
    setError("")
    const changed = itemsRef.current.map((item) =>
      item.id === space.id
        ? { ...item, isPinned: !space.isPinned, sortOrder: null }
        : item
    )
    update([...spaceGroup(changed, true), ...spaceGroup(changed, false)])
    try {
      const result = await organisationRequest<{ space: SpacePreference }>(
        `/api/spaces/${space.id}/pin`,
        {
          method: "PATCH",
          body: JSON.stringify({ pinned: !space.isPinned }),
        }
      )
      update(
        itemsRef.current.map((item) =>
          item.id === space.id ? { ...item, ...result.space } : item
        )
      )
    } catch (cause) {
      update(spaces)
      setError(organisationMessage(cause))
    } finally {
      pendingRef.current = false
      setPending(false)
      router.refresh()
    }
  }

  function move(space: StudySpace, direction: -1 | 1): void {
    if (pendingRef.current || props.preview) return
    const pinned = Boolean(space.isPinned)
    const ids = spaceGroup(itemsRef.current, pinned).map((item) => item.id)
    const index = ids.indexOf(space.id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= ids.length) return
    const neighbor = ids[next]!
    ids[next] = space.id
    ids[index] = neighbor
    update(orderGroup(itemsRef.current, pinned, ids))
    void saveOrder(pinned, ids)
  }

  const visibleIds = new Set(
    (showAll ? items : items.slice(0, 5)).map((space) => space.id)
  )
  return (
    <SidebarMenuItem>
      {[true, false].map((pinned) => {
        const group = spaceGroup(items, pinned)
        const visible = group.filter((space) => visibleIds.has(space.id))
        if (!visible.length) return null
        return (
          <Reorder.Group
            as="ul"
            key={String(pinned)}
            axis="y"
            values={visible.map((space) => space.id)}
            className="flex min-w-0 flex-col gap-1"
            aria-label={pinned ? "Pinned spaces" : "Spaces"}
            onReorder={(ids: string[]) => {
              if (pendingRef.current || props.preview) return
              const hidden = spaceGroup(itemsRef.current, pinned)
                .filter((space) => !visibleIds.has(space.id))
                .map((space) => space.id)
              update(orderGroup(itemsRef.current, pinned, [...ids, ...hidden]))
            }}
          >
            {visible.map((space) => {
              const index = group.findIndex((item) => item.id === space.id)
              return (
                <SidebarSpaceRow
                  key={space.id}
                  {...props}
                  spaces={items}
                  space={space}
                  open={expanded[space.id] ?? space.id === activeSpaceId}
                  onOpenChange={(open) =>
                    setExpanded((previous) => ({
                      ...previous,
                      [space.id]: open,
                    }))
                  }
                  pending={pending}
                  onPin={() => void pin(space)}
                  onMoveUp={index > 0 ? () => move(space, -1) : undefined}
                  onMoveDown={
                    index < group.length - 1 ? () => move(space, 1) : undefined
                  }
                  onDragStart={() => {
                    dragStart.current = group.map((item) => item.id)
                  }}
                  onDragEnd={() => {
                    const original = dragStart.current
                    dragStart.current = null
                    const ids = spaceGroup(itemsRef.current, pinned).map(
                      (item) => item.id
                    )
                    if (original && ids.some((id, i) => id !== original[i]))
                      void saveOrder(pinned, ids)
                  }}
                />
              )
            })}
          </Reorder.Group>
        )
      })}
      {items.length > 5 && (
        <SidebarMenuButton
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="h-8 text-muted-foreground"
        >
          <span>{showAll ? "Show less" : "See more"}</span>
        </SidebarMenuButton>
      )}
      {error && (
        <p role="alert" className="px-2 py-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </SidebarMenuItem>
  )
}
