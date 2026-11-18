"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { Folder, NavArrowDown } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"
import type { SpaceFolder } from "@/lib/organisation-types"
import type { RecentMaterial, StudySpace } from "./study-home"
import { FolderActions, FolderNameEditor } from "./folder-actions"
import { folderHref } from "./organisation-request"
import { MaterialIcon } from "./material-icon"

function MaterialLinks({
  materials,
  activeMaterialId,
  onNavigate,
}: {
  materials: RecentMaterial[]
  activeMaterialId?: string
  onNavigate?: () => void
}) {
  return (
    <>
      {materials.slice(0, 4).map((material) => (
        <SidebarMenuItem key={material.id}>
          <SidebarMenuButton
            isActive={material.id === activeMaterialId}
            render={
              <a href={`/materials/${material.id}`} onClick={onNavigate} />
            }
          >
            <MaterialIcon type={material.sourceType} />
            <span>{material.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  )
}

function FolderNavigation({
  folder,
  spaces,
  materials,
  activeFolderId,
  activeMaterialId,
  onNavigate,
}: {
  folder: SpaceFolder
  spaces: StudySpace[]
  materials: RecentMaterial[]
  activeFolderId?: string | null
  activeMaterialId?: string
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(folder.id === activeFolderId)
  const [renaming, setRenaming] = useState(false)
  const titleLink = useRef<HTMLAnchorElement>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (activeFolderId === folder.id) setOpen(true)
  }, [activeFolderId, folder.id])
  function finishRename() {
    setRenaming(false)
    requestAnimationFrame(() => titleLink.current?.focus())
  }
  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group/folder-row flex items-center rounded-xl hover:bg-sidebar-accent has-[:focus-visible]:bg-sidebar-accent">
          <CollapsibleTrigger
            aria-label={`${open ? "Collapse" : "Expand"} ${folder.title}`}
            render={
              <Button variant="ghost" size="icon-sm" className="shrink-0" />
            }
          >
            <Folder
              aria-hidden="true"
              className={cn(
                open
                  ? "hidden"
                  : "group-hover/folder-row:hidden group-has-[:focus-visible]/folder-row:hidden"
              )}
            />
            <motion.span
              aria-hidden="true"
              initial={false}
              animate={{ rotate: open ? 0 : -90 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
              className={cn(
                "items-center justify-center",
                open
                  ? "flex"
                  : "hidden group-hover/folder-row:flex group-has-[:focus-visible]/folder-row:flex"
              )}
            >
              <NavArrowDown />
            </motion.span>
          </CollapsibleTrigger>
          {renaming ? (
            <FolderNameEditor folder={folder} onCancel={finishRename} />
          ) : (
            <SidebarMenuButton
              isActive={folder.id === activeFolderId && !activeMaterialId}
              render={
                <Link
                  ref={titleLink}
                  href={folderHref(folder)}
                  onClick={onNavigate}
                />
              }
              className="h-9 min-w-0 flex-1 rounded-xl pl-0"
            >
              <span>{folder.title}</span>
            </SidebarMenuButton>
          )}
          <FolderActions
            folder={folder}
            spaces={spaces}
            onRename={() => setRenaming(true)}
            navigateAfterMove={
              folder.id === activeFolderId && !activeMaterialId
            }
            className="shrink-0 opacity-0 group-hover/folder-row:opacity-100 group-has-[:focus-visible]/folder-row:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
          />
        </div>
        <CollapsibleContent
          keepMounted
          render={
            <motion.div
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={{
                duration: reducedMotion ? 0 : 0.18,
                ease: "easeOut",
              }}
              className="overflow-hidden"
            />
          }
        >
          {materials.length ? (
            <SidebarMenu className="ml-3 w-auto border-l pl-2">
              <MaterialLinks
                materials={materials}
                activeMaterialId={activeMaterialId}
                onNavigate={onNavigate}
              />
              {materials.length > 4 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={
                      <Link href={folderHref(folder)} onClick={onNavigate} />
                    }
                  >
                    <span>More</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          ) : (
            <p className="px-8 py-2 text-xs text-muted-foreground">
              {folder.materialCount > 0 ? (
                <Link href={folderHref(folder)} onClick={onNavigate}>
                  Open folder
                </Link>
              ) : (
                "No contents inside"
              )}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

export function SpaceContentsNavigation({
  space,
  spaces,
  materials,
  activeFolderId,
  activeMaterialId,
  onNavigate,
}: {
  space: StudySpace
  spaces: StudySpace[]
  materials: RecentMaterial[]
  activeFolderId?: string | null
  activeMaterialId?: string
  onNavigate?: () => void
}) {
  const rootMaterials = materials.filter((material) => !material.folderId)
  const folders = space.folders ?? []
  if (!materials.length && !folders.length)
    return (
      <p className="px-8 py-2 text-sm text-muted-foreground">
        No contents inside
      </p>
    )
  return (
    <SidebarMenu className="ml-3 w-auto border-l pl-2">
      {folders.map((folder) => (
        <FolderNavigation
          key={folder.id}
          folder={folder}
          spaces={spaces}
          materials={materials.filter(
            (material) => material.folderId === folder.id
          )}
          activeFolderId={activeFolderId}
          activeMaterialId={activeMaterialId}
          onNavigate={onNavigate}
        />
      ))}
      <MaterialLinks
        materials={rootMaterials}
        activeMaterialId={activeMaterialId}
        onNavigate={onNavigate}
      />
      {rootMaterials.length > 4 && (
        <SidebarMenuItem>
          <SidebarMenuButton
            render={<Link href={`/spaces/${space.id}`} onClick={onNavigate} />}
          >
            <span>More</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  )
}
