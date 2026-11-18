"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Spinner } from "@workspace/ui/components/spinner"

export type CreateSpaceAction = (
  formData: FormData
) => Promise<{ error?: string; id?: string }>

export function CreateSpaceDialog({
  open,
  onOpenChange,
  action,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: CreateSpaceAction
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function create(formData: FormData) {
    setPending(true)
    setError("")
    try {
      const result = await action(formData)
      if (result.error || !result.id) {
        setError(
          result.error ?? "We couldn’t create this space. Please try again."
        )
        return
      }
      setTitle("")
      setDescription("")
      onOpenChange(false)
      router.push(`/spaces/${encodeURIComponent(result.id)}`)
      router.refresh()
    } catch {
      setError(
        "We couldn’t reach your workspace. Check your connection and try again."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-[500px] rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle>New Space</DialogTitle>
          <DialogDescription>
            Keep the materials for a class, topic or exam together.
          </DialogDescription>
        </DialogHeader>
        <form action={create}>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="space-title">Name</FieldLabel>
              <Input
                id="space-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Biology"
                autoFocus
                disabled={pending}
                className="h-11"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="space-description">
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Textarea
                id="space-description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                disabled={pending}
                placeholder="What are you studying?"
                className="min-h-24"
              />
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={pending || !title.trim()}
              className="h-12 rounded-full"
            >
              {pending && <Spinner />}
              {pending ? "Creating space…" : "Create space"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
