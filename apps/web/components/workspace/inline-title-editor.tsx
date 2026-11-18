"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { organisationMessage } from "./organisation-request"

export function InlineTitleEditor({
  title,
  maxLength,
  label,
  onSave,
  onCancel,
}: {
  title: string
  maxLength: number
  label: string
  onSave: (title: string) => Promise<void>
  onCancel: () => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(title)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const cancelled = useRef(false)

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (inFlight.current || cancelled.current) return
    const name = draft.trim()
    if (!name) {
      setError("Enter a name.")
      return
    }
    if (name === title) {
      onCancel()
      return
    }
    inFlight.current = true
    setPending(true)
    setError("")
    try {
      await onSave(name)
      onCancel()
    } catch (cause) {
      setError(organisationMessage(cause))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => void save(event)}
      onClick={(event) => event.stopPropagation()}
    >
      <FieldGroup className="gap-1.5">
        <Field data-invalid={!!error} className="gap-1">
          <FieldLabel htmlFor={id} className="sr-only">
            {label}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={id}
              value={draft}
              autoFocus
              maxLength={maxLength}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby={`${id}-hint`}
              className="h-8 min-w-0 rounded-md px-2 text-sm"
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                setDraft(event.target.value)
                setError("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelled.current = true
                  onCancel()
                }
              }}
            />
            {pending && <Spinner />}
          </div>
          <span id={`${id}-hint`} className="sr-only">
            Press Enter to save, or Escape to cancel.
          </span>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error} Your name draft is still here.
            </p>
          )}
        </Field>
        {error && (
          <div className="flex gap-1">
            <Button
              type="submit"
              variant="outline"
              size="xs"
              disabled={pending}
            >
              Retry
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() => {
                cancelled.current = true
                onCancel()
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </FieldGroup>
    </form>
  )
}
