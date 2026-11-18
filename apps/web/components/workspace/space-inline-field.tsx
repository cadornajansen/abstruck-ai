"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

export function SpaceInlineField({
  value,
  field,
  compact = false,
  disabled,
  onSave,
}: {
  value: string
  field: "title" | "description"
  compact?: boolean
  disabled: boolean
  onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const cancelled = useRef(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  useEffect(() => {
    if (!editing) return
    const element = field === "title" ? input.current : textarea.current
    element?.focus()
    if (field === "title") element?.select()
  }, [editing, field])

  async function commit(): Promise<void> {
    if (cancelled.current || saving.current) return
    if (draft.trim() === value || (field === "title" && !draft.trim())) {
      setEditing(false)
      return
    }
    saving.current = true
    try {
      await onSave(draft)
      setEditing(false)
    } catch {
      /* The parent shows the error; keep this draft available to retry. */
    } finally {
      saving.current = false
    }
  }
  function keyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      cancelled.current = true
      setDraft(value)
      setEditing(false)
      requestAnimationFrame(() => button.current?.focus())
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.blur()
      requestAnimationFrame(() => button.current?.focus())
    }
  }
  const title = field === "title"
  const className = cn(
    "h-auto w-fit max-w-full min-w-0 self-start justify-start rounded-lg px-1 py-0.5 text-left font-normal shadow-none",
    title
      ? compact
        ? "text-sm"
        : "text-3xl leading-tight tracking-tight md:text-3xl"
      : "text-sm leading-6 text-muted-foreground"
  )
  const editorClassName = cn(
    className,
    "field-sizing-content w-auto min-w-[2ch] focus-visible:border-input focus-visible:ring-0"
  )
  if (editing)
    return title ? (
      <Input
        ref={input}
        aria-label={compact ? "Header space title" : "Space title"}
        value={draft}
        maxLength={120}
        disabled={disabled}
        className={editorClassName}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={keyDown}
      />
    ) : (
      <Textarea
        ref={textarea}
        aria-label="Space description"
        value={draft}
        placeholder="No description"
        rows={1}
        maxLength={1000}
        disabled={disabled}
        className={cn(editorClassName, "min-h-7 resize-none")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={keyDown}
      />
    )
  return (
    <Button
      ref={button}
      variant="ghost"
      disabled={disabled}
      aria-label={
        title
          ? compact
            ? "Edit header space title"
            : "Edit space title"
          : "Edit space description"
      }
      className={cn(
        className,
        "break-words whitespace-normal hover:border-transparent hover:bg-transparent",
        compact && "truncate whitespace-nowrap"
      )}
      onClick={() => {
        cancelled.current = false
        setEditing(true)
      }}
    >
      {value || (title ? "Untitled Space" : "No description")}
    </Button>
  )
}
