"use client"

import { useEffect, useState } from "react"
import { NavArrowDown } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type { ChatModelOption, ChatPreferences } from "@/lib/chat-preferences"

export function ChatModelPicker({
  preferences,
  models,
  disabled,
  onChange,
  onOpenChange,
}: {
  preferences: ChatPreferences
  models: ChatModelOption[]
  disabled: boolean
  onChange: (preferences: ChatPreferences) => void
  onOpenChange: (open: boolean) => void
}) {
  const selectedModel = models.find((model) => model.id === preferences.model)
  const selectionUnavailable = preferences.model !== "auto" && !selectedModel
  const label =
    preferences.model === "auto"
      ? "Auto"
      : (selectedModel?.label ?? "Unavailable model")
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Choose GPT model: ${label}`}
            className="h-7 shrink-0 gap-1 rounded-full px-1 text-xs font-normal text-muted-foreground"
          />
        }
      >
        {label}
        <NavArrowDown aria-hidden="true" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 rounded-2xl p-1.5"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Answer model</DropdownMenuLabel>
          {selectionUnavailable && (
            <p
              role="status"
              className="px-3 py-2 text-xs leading-5 text-muted-foreground"
            >
              Your saved model is unavailable. Choose Auto or another available
              model.
            </p>
          )}
          <DropdownMenuRadioGroup
            value={preferences.model}
            onValueChange={(model) =>
              onChange({
                ...preferences,
                model: model as ChatPreferences["model"],
              })
            }
          >
            <DropdownMenuRadioItem
              value="auto"
              disabled={!models.some((model) => model.id === "gpt-6-luna")}
              closeOnClick
              className="min-h-10 rounded-xl px-3"
            >
              <span className="flex flex-col gap-0.5">
                <span>Auto</span>
                <span className="text-xs font-normal text-muted-foreground">
                  GPT-6 Luna · efficient study default
                </span>
              </span>
            </DropdownMenuRadioItem>
            {models.map((model) => (
              <DropdownMenuRadioItem
                key={model.id}
                value={model.id}
                closeOnClick
                className="min-h-12 rounded-xl px-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span>{model.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {model.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {models.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No GPT models are available. Refresh to reconnect.
            </p>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">
          Higher-usage models may exceed the answer budget with long context.
          Your choice is never silently replaced.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ChatInstructionsDialog({
  open,
  onOpenChange,
  preferences,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preferences: ChatPreferences
  onChange: (preferences: ChatPreferences) => void
}) {
  const [draft, setDraft] = useState(preferences.instructions)
  useEffect(() => {
    if (open) setDraft(preferences.instructions)
  }, [open, preferences.instructions])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>Chat instructions</DialogTitle>
          <DialogDescription>
            Tell Abstruck how you like to learn. Answers still follow your
            selected materials.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="chat-instructions">
              Your preferences
            </FieldLabel>
            <Textarea
              id="chat-instructions"
              maxLength={1000}
              rows={6}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="For example: explain step by step, use simple examples, and ask me a practice question."
              className="max-h-64 resize-y rounded-xl"
            />
            <FieldDescription className="text-right">
              {draft.length} / 1,000
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onChange({ ...preferences, instructions: draft.trim() })
              onOpenChange(false)
            }}
          >
            Save instructions
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
