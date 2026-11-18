"use client"

import { useRef, useState } from "react"
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
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@workspace/ui/components/table"
import type { SpaceFolder } from "@/lib/organisation-types"
import type { MaterialListItem } from "./collection-view"
import type { StudySpace } from "./study-home"
import { FolderActions, FolderNameEditor } from "./folder-actions"
import { AddedOn, MaterialListRow } from "./material-card"
import { folderHref } from "./organisation-request"

export function FolderCard({
  folder,
  spaces,
}: {
  folder: SpaceFolder
  spaces: StudySpace[]
}) {
  const [renaming, setRenaming] = useState(false)
  const titleLink = useRef<HTMLAnchorElement>(null)
  function finishRename() {
    setRenaming(false)
    requestAnimationFrame(() => titleLink.current?.focus())
  }
  return (
    <article className="group/folder relative flex min-h-[62px] w-full items-center gap-3 rounded-[24px] border bg-card px-4 py-3 shadow-xs sm:w-[221px]">
      <Folder
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground"
      />
      {renaming ? (
        <FolderNameEditor folder={folder} onCancel={finishRename} />
      ) : (
        <Link
          ref={titleLink}
          href={folderHref(folder)}
          className="min-w-0 flex-1 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
          <h2 className="truncate pr-4 text-sm">{folder.title}</h2>
          <p className="text-xs text-muted-foreground">
            {folder.materialCount}{" "}
            {folder.materialCount === 1 ? "content" : "contents"}
          </p>
        </Link>
      )}
      <FolderActions
        folder={folder}
        spaces={spaces}
        onRename={() => setRenaming(true)}
        className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-focus-within/folder:opacity-100 group-hover/folder:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </article>
  )
}

export function FolderTableGroup({
  folder,
  spaces,
  materials,
  onDelete,
}: {
  folder: SpaceFolder
  spaces: StudySpace[]
  materials: MaterialListItem[]
  onDelete?: (item: MaterialListItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const titleLink = useRef<HTMLAnchorElement>(null)
  const reducedMotion = useReducedMotion()
  function finishRename() {
    setRenaming(false)
    requestAnimationFrame(() => titleLink.current?.focus())
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<TableBody />}>
      <TableRow className="group/folder h-14 border-0 hover:bg-muted/30">
        <TableCell className="min-w-0 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <CollapsibleTrigger
              aria-label={`${open ? "Collapse" : "Expand"} ${folder.title}`}
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 shrink-0"
                />
              }
            >
              <motion.span
                initial={false}
                animate={{ rotate: open ? 0 : -90 }}
                transition={{ duration: reducedMotion ? 0 : 0.16 }}
              >
                <NavArrowDown />
              </motion.span>
            </CollapsibleTrigger>
            <Folder
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            {renaming ? (
              <FolderNameEditor folder={folder} onCancel={finishRename} />
            ) : (
              <Link
                ref={titleLink}
                href={folderHref(folder)}
                className="min-w-0 flex-1 truncate rounded-md py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                {folder.title}
              </Link>
            )}
          </div>
        </TableCell>
        <TableCell className="w-[120px] px-3 py-2 text-muted-foreground sm:w-[180px]">
          <AddedOn
            createdAt={folder.createdAt}
            className="block truncate text-xs sm:text-sm"
          />
        </TableCell>
        <TableCell className="w-10 pr-2 pl-0 text-right">
          <FolderActions
            folder={folder}
            spaces={spaces}
            onRename={() => setRenaming(true)}
          />
        </TableCell>
      </TableRow>
      <TableRow className="border-0 hover:bg-transparent">
        <TableCell colSpan={3} className="p-0">
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
              <Table
                className="table-fixed"
                aria-label={`${folder.title} materials`}
              >
                <colgroup>
                  <col />
                  <col className="w-[120px] sm:w-[180px]" />
                  <col className="w-10" />
                </colgroup>
                <TableBody>
                  {materials.map((item) => (
                    <MaterialListRow
                      key={item.id}
                      item={item}
                      spaces={spaces}
                      onDelete={onDelete ? () => onDelete(item) : undefined}
                      nested
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-3 pl-12 text-sm text-muted-foreground">
                {folder.materialCount > 0 ? (
                  <Link
                    href={folderHref(folder)}
                    className="underline underline-offset-4"
                  >
                    Open folder to view its contents
                  </Link>
                ) : (
                  "No contents inside"
                )}
              </div>
            )}
          </CollapsibleContent>
        </TableCell>
      </TableRow>
    </Collapsible>
  )
}
