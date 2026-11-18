"use client"

import { useState } from "react"
import {
  Clock,
  Plus,
  AtSign,
  Search,
  Book,
  Brain,
  Globe,
  Check,
  ControlSlider,
  MultiplePages,
  NavArrowLeft,
  NavArrowRight,
  Page,
  Wrench,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldLabel, FieldGroup } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Separator } from "@workspace/ui/components/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverTitle,
  PopoverDescription,
} from "@workspace/ui/components/popover"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@workspace/ui/components/empty"
import { MaterialIcon } from "./material-icon"
import { studyOutputTools } from "./study-output-catalog"
import { cn } from "@workspace/ui/lib/utils"
import type { ChatPreferences } from "@/lib/chat-preferences"
import type { StudyToolType } from "./study-tools-types"

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}
export interface ChatSourceOption {
  id: string
  title: string
  sourceType?: string
}

export function ConversationControls({
  conversations,
  selectedId,
  disabled,
  onNew,
  onSelect,
}: {
  conversations: ConversationSummary[]
  selectedId: string | null
  disabled: boolean
  onNew: () => void
  onSelect: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const matches = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="rounded-full text-muted-foreground"
        aria-label="New conversation"
        disabled={disabled}
        onClick={onNew}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="rounded-full text-muted-foreground"
        aria-label="Conversation history"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Clock aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(32rem,85dvh)] gap-4 rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conversation history</DialogTitle>
            <DialogDescription>
              Return to a saved conversation about this material.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {matches.length ? (
              matches.map((conversation) => (
                <Button
                  key={conversation.id}
                  variant={
                    selectedId === conversation.id ? "secondary" : "ghost"
                  }
                  className="h-auto justify-start rounded-xl px-3 py-3 text-left"
                  onClick={async () => {
                    await onSelect(conversation.id)
                    setOpen(false)
                  }}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate">{conversation.title}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                </Button>
              ))
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No conversations yet</EmptyTitle>
                  <EmptyDescription>
                    Ask a question to start a saved conversation.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ChatContext({
  options,
  selectedIds,
  minimumSources = 1,
  disabled,
  onChange,
  open,
  onOpenChange,
  preferences,
  webSearchAvailable = false,
  onPreferencesChange,
  onInstructions,
  onSelectTool,
}: {
  options: ChatSourceOption[]
  selectedIds: string[]
  minimumSources?: number
  disabled: boolean
  onChange: (ids: string[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  preferences?: ChatPreferences
  webSearchAvailable?: boolean
  onPreferencesChange?: (preferences: ChatPreferences) => void
  onInstructions?: () => void
  onSelectTool?: (type: StudyToolType) => void
}) {
  const [search, setSearch] = useState("")
  const [toolView, setToolView] = useState(false)
  const tools: {
    type: StudyToolType
    title: string
    icon: typeof Page
    color: string
  }[] = [
    {
      type: "quiz",
      title: "Quiz",
      icon: Book,
      color: "bg-(--tool-quiz-bg) text-(--tool-quiz)",
    },
    {
      type: "flashcards",
      title: "Flashcards",
      icon: MultiplePages,
      color: "bg-(--tool-flashcards-bg) text-(--tool-flashcards)",
    },
    ...studyOutputTools.map((tool) => ({ ...tool, color: tool.chip })),
  ]
  const matches = options.filter((option) =>
    option.title.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          setToolView(false)
          setSearch("")
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-7 max-w-full rounded-full px-2 text-xs font-normal text-muted-foreground"
          />
        }
      >
        <AtSign data-icon="inline-start" aria-hidden="true" /> Add Context
        {preferences?.webSearch
          ? " · Search"
          : selectedIds.length > 1
            ? ` · ${selectedIds.length}`
            : ""}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-1"
      >
        <PopoverTitle className="sr-only">
          {toolView ? "Study tools" : "Study context"}
        </PopoverTitle>
        <InputGroup className="h-10 rounded-none border-0 bg-background shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0">
          <InputGroupAddon className="pl-2">
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Find context materials"
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <Separator className="my-1" />
        {toolView ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-9 justify-start gap-2 rounded-xl px-2.5 text-sm font-normal text-muted-foreground"
              onClick={() => {
                setToolView(false)
                setSearch("")
              }}
            >
              <NavArrowLeft aria-hidden="true" />
              Study tools
            </Button>
            <div className="flex max-h-[min(25rem,60dvh)] flex-col gap-0.5 overflow-y-auto">
              {tools
                .filter((tool) =>
                  tool.title.toLowerCase().includes(search.toLowerCase())
                )
                .map(({ type, title, icon: Icon, color }) => (
                  <Button
                    key={type}
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    className="min-h-9 shrink-0 justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                    onClick={() => {
                      onOpenChange(false)
                      setToolView(false)
                      setSearch("")
                      onSelectTool?.(type)
                    }}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        color
                          .split(" ")
                          .find((name) => name.startsWith("text-"))
                      )}
                    />
                    {title}
                  </Button>
                ))}
            </div>
          </>
        ) : (
          <>
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              Materials
            </p>
            <FieldGroup className="max-h-64 gap-0.5 overflow-x-hidden overflow-y-auto">
              {matches.map((option) => {
                const checked = selectedIds.includes(option.id)
                return (
                  <Field
                    key={option.id}
                    orientation="horizontal"
                    className="rounded-xl px-2.5 py-2 hover:bg-muted"
                  >
                    <Checkbox
                      id={`context-${option.id}`}
                      checked={checked}
                      className="order-last ml-auto border-transparent bg-transparent data-checked:border-transparent data-checked:bg-transparent data-checked:text-plan-foreground"
                      disabled={
                        (!checked && selectedIds.length >= 3) ||
                        (checked && selectedIds.length <= minimumSources) ||
                        preferences?.webSearch ||
                        disabled
                      }
                      onCheckedChange={(value) =>
                        onChange(
                          value
                            ? [...selectedIds, option.id]
                            : selectedIds.filter((id) => id !== option.id)
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`context-${option.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 font-normal"
                    >
                      <MaterialIcon
                        type={option.sourceType}
                        className={cn(
                          "size-4 shrink-0",
                          checked
                            ? "text-(--tool-flashcards)"
                            : "text-muted-foreground"
                        )}
                      />
                      <span className="truncate">{option.title}</span>
                    </FieldLabel>
                  </Field>
                )
              })}
              {matches.length === 0 && (
                <p className="px-2.5 py-4 text-sm text-muted-foreground">
                  No matching materials.
                </p>
              )}
            </FieldGroup>
            {preferences && onPreferencesChange && (
              <>
                <Separator className="my-1" />
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  Context
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-pressed={!preferences.webSearch}
                  className="h-9 w-full justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                  onClick={() =>
                    onPreferencesChange({ ...preferences, webSearch: false })
                  }
                >
                  <Brain aria-hidden="true" className="text-plan-foreground" />
                  Learn
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Built in
                  </span>
                  {!preferences.webSearch && (
                    <Check
                      className="ml-auto text-plan-foreground"
                      aria-hidden="true"
                    />
                  )}
                </Button>
                {(webSearchAvailable || preferences.webSearch) && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled || !webSearchAvailable}
                    aria-pressed={preferences.webSearch}
                    className="h-9 w-full justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                    onClick={() =>
                      onPreferencesChange({
                        ...preferences,
                        webSearch: !preferences.webSearch,
                      })
                    }
                  >
                    <Globe aria-hidden="true" className="text-info-accent" />
                    Search
                    {preferences.webSearch && (
                      <Check
                        className="ml-auto text-info-accent"
                        aria-hidden="true"
                      />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-pressed={preferences.studyMode}
                  className="h-9 w-full justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                  onClick={() =>
                    onPreferencesChange({
                      ...preferences,
                      studyMode: !preferences.studyMode,
                    })
                  }
                >
                  <Book aria-hidden="true" className="text-(--tool-quiz)" />
                  Study Mode
                  {preferences.studyMode && (
                    <Check className="ml-auto" aria-hidden="true" />
                  )}
                </Button>
              </>
            )}
            {(onSelectTool || onInstructions) && (
              <>
                <Separator className="my-1" />
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  Other tools
                </p>
                {onSelectTool && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    className="h-9 w-full justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                    onClick={() => {
                      setToolView(true)
                      setSearch("")
                    }}
                  >
                    <Wrench
                      aria-hidden="true"
                      className="text-plan-foreground"
                    />
                    Study tools
                    <NavArrowRight className="ml-auto" aria-hidden="true" />
                  </Button>
                )}
                {onInstructions && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    className="h-9 w-full justify-start gap-3 rounded-xl px-2.5 text-sm font-normal"
                    onClick={onInstructions}
                  >
                    <ControlSlider
                      aria-hidden="true"
                      className="text-(--tool-notes)"
                    />
                    Chat instructions
                    <span className="ml-auto text-xs text-muted-foreground">
                      {preferences?.instructions ? "1" : ""}
                    </span>
                  </Button>
                )}
              </>
            )}
          </>
        )}
        <Separator className="my-1" />
        <PopoverDescription className="px-2.5 py-2 text-xs">
          {preferences?.webSearch
            ? webSearchAvailable
              ? "Search uses public web sources. Selected materials are not used."
              : "Search is unavailable. Select Learn to continue."
            : "Choose up to three materials for this conversation."}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
