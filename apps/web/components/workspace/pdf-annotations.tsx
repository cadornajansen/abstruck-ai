"use client"

import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Check,
  ChatBubble,
  EditPencil,
  MoreVert,
  NavArrowDown,
  Search,
  Trash,
  Xmark,
} from "iconoir-react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { Separator } from "@workspace/ui/components/separator"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"
import {
  annotationColors,
  annotationLimits,
  type AnnotationColor,
  type MaterialAnnotation,
  type AnnotationLocator,
  type PdfHighlightLocator,
} from "@/lib/annotation-types"
import { formatSourceTime } from "@/lib/source-position"

const colorStyles: Record<
  AnnotationColor,
  { label: string; swatch: string; rule: string }
> = {
  yellow: {
    label: "Yellow",
    swatch: "bg-annotation-yellow",
    rule: "border-annotation-yellow/70",
  },
  green: {
    label: "Green",
    swatch: "bg-annotation-green",
    rule: "border-annotation-green/70",
  },
  blue: {
    label: "Blue",
    swatch: "bg-annotation-blue",
    rule: "border-annotation-blue/70",
  },
  red: {
    label: "Red",
    swatch: "bg-annotation-red",
    rule: "border-annotation-red/70",
  },
}

export interface AnnotationPanelProps<
  Locator extends AnnotationLocator = PdfHighlightLocator,
> {
  annotations: MaterialAnnotation<Locator>[]
  currentVersion: number
  loading: boolean
  error: string | null
  busyId: string | null
  autoHighlight: boolean
  onAutoHighlightChange: (enabled: boolean) => void
  onClose: () => void
  onSelect: (annotation: MaterialAnnotation<Locator>) => void
  onRetry: () => void
  mode?: "page" | "time"
  className?: string
}

function AnnotationRow<Locator extends AnnotationLocator>({
  annotation,
  stale,
  busy,
  onSelect,
}: {
  annotation: MaterialAnnotation<Locator>
  stale: boolean
  busy: boolean
  onSelect: (annotation: MaterialAnnotation<Locator>) => void
}) {
  const reduceMotion = useReducedMotion()
  const quote = annotation.locator.quote
  const location =
    annotation.locator.type === "page"
      ? `page ${annotation.locator.page}`
      : formatSourceTime(annotation.locator.startMs)
  const earlierVersion =
    annotation.locator.type === "page"
      ? "Earlier PDF version"
      : "Earlier source version"
  return (
    <motion.li
      id={`annotation-${annotation.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.14 }}
      className="group/annotation relative rounded-xl border border-border/60 bg-background"
    >
      <Button
        variant="ghost"
        disabled={busy}
        aria-label={`Annotation at ${location}${stale ? `, ${earlierVersion}` : ""}: ${quote}`}
        onClick={() => onSelect(annotation)}
        className="h-auto w-full justify-start rounded-xl px-2.5 py-3 text-left whitespace-normal"
      >
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1.5 border-l-2 pr-3 pl-2",
            colorStyles[annotation.color].rule
          )}
        >
          <p className="line-clamp-2 text-sm leading-5 font-normal break-words text-muted-foreground">
            {quote}
          </p>
          {annotation.body && (
            <p className="line-clamp-3 text-xs leading-4 font-normal break-words whitespace-pre-wrap text-foreground">
              {annotation.body}
            </p>
          )}
          {annotation.locator.type === "time" && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {location}
            </span>
          )}
          {stale && <Badge variant="outline">{earlierVersion}</Badge>}
        </div>
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={busy}
        aria-label={`Actions for annotation at ${location}: ${quote}`}
        onClick={() => onSelect(annotation)}
        className="absolute top-1.5 right-1 opacity-0 group-focus-within/annotation:opacity-100 group-hover/annotation:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {busy ? <Spinner /> : <MoreVert aria-hidden="true" />}
      </Button>
    </motion.li>
  )
}

export function AnnotationPanel<
  Locator extends AnnotationLocator = PdfHighlightLocator,
>({
  annotations,
  currentVersion,
  loading,
  error,
  busyId,
  autoHighlight,
  onAutoHighlightChange,
  onClose,
  onSelect,
  onRetry,
  mode = "page",
  className,
}: AnnotationPanelProps<Locator>) {
  const [search, setSearch] = useState("")
  const switchId = useId()
  const reduceMotion = useReducedMotion()
  const query = search.trim().toLocaleLowerCase()
  const visible = annotations.filter((annotation) =>
    `${annotation.locator.quote}\n${annotation.body}`
      .toLocaleLowerCase()
      .includes(query)
  )
  return (
    <motion.aside
      aria-label={mode === "page" ? "PDF annotations" : "Media annotations"}
      aria-busy={loading}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
      className={cn(
        "flex h-full min-h-0 w-64 max-w-full shrink-0 flex-col border-r border-border/60 bg-background",
        className
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <h2 className="min-w-0 flex-1 text-sm font-medium">Annotations</h2>
        {mode === "page" && (
          <Field orientation="horizontal" className="w-auto gap-1.5">
            <FieldLabel
              htmlFor={switchId}
              className="gap-1 text-xs font-normal text-muted-foreground"
            >
              <EditPencil aria-hidden="true" className="size-3" /> Auto
            </FieldLabel>
            <Switch
              id={switchId}
              size="sm"
              checked={autoHighlight}
              onCheckedChange={onAutoHighlightChange}
              aria-label="Automatically highlight selected text"
            />
          </Field>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close annotations"
          onClick={onClose}
        >
          <Xmark aria-hidden="true" />
        </Button>
      </header>
      {annotations.length > 0 && (
        <div className="shrink-0 border-b border-border/60 px-3 py-2">
          <InputGroup className="rounded-xl bg-muted/25">
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search annotations"
              placeholder="Search annotations…"
            />
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
            <Button
              variant="outline"
              size="xs"
              onClick={onRetry}
              disabled={loading}
              className="mt-2 w-fit"
            >
              Retry
            </Button>
          </Alert>
        )}
        {loading && (
          <p
            role="status"
            className="mb-3 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Spinner /> Loading annotations…
          </p>
        )}
        {visible.length > 0 ? (
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {visible.map((annotation) => (
                <AnnotationRow
                  key={annotation.id}
                  annotation={annotation}
                  stale={annotation.extractionVersion !== currentVersion}
                  busy={busyId === annotation.id}
                  onSelect={onSelect}
                />
              ))}
            </AnimatePresence>
          </ul>
        ) : !loading && !error ? (
          <Empty className="justify-start gap-3 px-1 py-12">
            <EmptyHeader>
              <EmptyMedia>
                <EditPencil
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                />
              </EmptyMedia>
              <EmptyTitle>
                {annotations.length
                  ? "No matching annotations"
                  : "No annotations yet"}
              </EmptyTitle>
              <EmptyDescription>
                {annotations.length
                  ? "Try another word from a highlight or comment."
                  : mode === "time"
                    ? "Choose a transcript passage and select Highlight. Add a comment to keep a timestamped note."
                    : "Select text in the PDF, then choose Highlight. Turn on Auto to highlight text as you select it."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </motion.aside>
  )
}

export interface AnnotationActionsProps {
  annotation: MaterialAnnotation<AnnotationLocator>
  busy: boolean
  onColorChange: (color: AnnotationColor) => void
  onComment: () => void
  onDelete: () => void
  onClose: () => void
}

export function AnnotationActions({
  annotation,
  busy,
  onColorChange,
  onComment,
  onDelete,
  onClose,
}: AnnotationActionsProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      role="group"
      aria-label="Annotation actions"
      aria-busy={busy}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.14 }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation()
          onClose()
        }
      }}
      className="flex w-max max-w-full items-center gap-1"
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          disabled={busy}
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Highlight color: ${colorStyles[annotation.color].label}`}
            />
          }
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-3.5 rounded-full",
              colorStyles[annotation.color].swatch
            )}
          />
          <NavArrowDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-28 rounded-xl">
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={annotation.color}
              onValueChange={(value) => {
                if (!busy && annotationColors.some((color) => color === value))
                  onColorChange(value as AnnotationColor)
              }}
            >
              {annotationColors.map((color) => (
                <DropdownMenuRadioItem
                  key={color}
                  value={color}
                  disabled={busy}
                  closeOnClick
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 rounded-full",
                      colorStyles[color].swatch
                    )}
                  />
                  {colorStyles[color].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="my-1" />
      <Button variant="ghost" size="sm" onClick={onComment} disabled={busy}>
        <ChatBubble aria-hidden="true" data-icon="inline-start" /> Comment
      </Button>
      <Separator orientation="vertical" className="my-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={busy}
        className="text-destructive hover:text-destructive"
      >
        <Trash aria-hidden="true" data-icon="inline-start" /> Delete
      </Button>
    </motion.div>
  )
}

export interface AnnotationCommentProps {
  initialBody: string
  busy: boolean
  saveDisabled?: boolean
  error: string | null
  onSave: (body: string) => void
  onCancel: () => void
}

export function AnnotationComment({
  initialBody,
  busy,
  saveDisabled = false,
  error,
  onSave,
  onCancel,
}: AnnotationCommentProps) {
  const [body, setBody] = useState(initialBody)
  const fieldId = useId()
  const errorId = useId()
  const limitId = useId()
  const reduceMotion = useReducedMotion()
  return (
    <motion.form
      aria-label="Annotation comment"
      aria-busy={busy}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.14 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && !saveDisabled && body.length <= annotationLimits.body)
          onSave(body)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation()
          onCancel()
        }
      }}
      className="w-72 max-w-full p-1"
    >
      <FieldGroup className="gap-2">
        <Field data-disabled={busy} className="gap-1.5">
          <FieldLabel htmlFor={fieldId} className="sr-only">
            Comment
          </FieldLabel>
          <InputGroup>
            <InputGroupTextarea
              id={fieldId}
              autoFocus
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Add a comment…"
              rows={3}
              maxLength={annotationLimits.body}
              disabled={busy}
              aria-describedby={error ? `${errorId} ${limitId}` : limitId}
            />
            <InputGroupAddon align="block-end" className="justify-end gap-1">
              <span
                id={limitId}
                className="mr-auto text-xs font-normal text-muted-foreground"
              >
                {body.length.toLocaleString()} /{" "}
                {annotationLimits.body.toLocaleString()}
              </span>
              <InputGroupButton
                size="icon-xs"
                aria-label="Cancel comment"
                onClick={onCancel}
                disabled={busy}
              >
                <Xmark aria-hidden="true" />
              </InputGroupButton>
              <InputGroupButton
                type="submit"
                size="icon-xs"
                variant="default"
                aria-label="Save comment"
                disabled={busy || saveDisabled || body === initialBody}
              >
                {busy ? <Spinner /> : <Check aria-hidden="true" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        {error && (
          <Alert id={errorId} variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </motion.form>
  )
}
