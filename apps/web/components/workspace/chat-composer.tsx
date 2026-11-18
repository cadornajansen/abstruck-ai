"use client"

import { useState, type FormEvent } from "react"
import { ArrowUp, Square } from "iconoir-react"
import { motion, useReducedMotion } from "motion/react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import {
  DEFAULT_CHAT_PREFERENCES,
  type ChatModelOption,
  type ChatPreferences,
} from "@/lib/chat-preferences"
import type { StudyToolType } from "./study-tools-types"
import {
  ChatInstructionsDialog,
  ChatModelPicker,
} from "./chat-preference-controls"
import {
  ChatContext,
  ConversationControls,
  type ChatSourceOption,
  type ConversationSummary,
} from "./chat-controls"

interface ChatComposerProps {
  draft: string
  ready: boolean
  pending: boolean
  available: boolean
  historyLoading: boolean
  contextMaterials: ChatSourceOption[]
  selectedSourceIds: string[]
  minimumSources?: number
  preferences?: ChatPreferences
  availableModels?: ChatModelOption[]
  webSearchAvailable?: boolean
  onPreferencesChange?: (preferences: ChatPreferences) => void
  onSelectTool?: (type: StudyToolType) => void
  conversations: ConversationSummary[]
  conversationId: string | null
  onDraftChange: (draft: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onSourcesChange?: (ids: string[]) => void
  onConversationChange?: (id: string) => Promise<void>
  onNewConversation?: () => void
  onStop?: () => void
}

export function ChatComposer({
  draft,
  ready,
  pending,
  available,
  historyLoading,
  contextMaterials,
  selectedSourceIds,
  minimumSources = 1,
  preferences = DEFAULT_CHAT_PREFERENCES,
  availableModels = [],
  webSearchAvailable = false,
  onPreferencesChange,
  onSelectTool,
  conversations,
  conversationId,
  onDraftChange,
  onSubmit,
  onSourcesChange,
  onConversationChange,
  onNewConversation,
  onStop,
}: ChatComposerProps) {
  const [focused, setFocused] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const expanded =
    focused || contextOpen || modelOpen || instructionsOpen || draft.length > 0
  const conversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)
      ?.title ?? "New conversation"

  return (
    <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1.5 px-1">
        <span className="shrink-0 text-xs text-muted-foreground">
          Chatting in:
        </span>
        <span
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full border px-2.5 text-xs text-primary/80"
          title={conversationTitle}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              expanded ? "bg-plan-foreground" : "bg-muted-foreground"
            )}
          />
          <span className="truncate">{conversationTitle}</span>
        </span>
        {onNewConversation && onConversationChange && (
          <ConversationControls
            conversations={conversations}
            selectedId={conversationId}
            disabled={pending || historyLoading}
            onNew={onNewConversation}
            onSelect={onConversationChange}
          />
        )}
      </div>
      <InputGroup
        data-expanded={expanded}
        className="gap-0 rounded-3xl bg-background p-2 shadow-composer has-disabled:bg-background has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-0"
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false)
        }}
      >
        <InputGroupTextarea
          aria-label="Ask anything"
          placeholder="Ask anything"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          rows={1}
          maxLength={2000}
          className="max-h-40 min-h-9 py-1.5 pr-12 pl-2 text-base leading-6 placeholder:text-primary/50 md:text-base"
        />
        <InputGroupAddon align="block-end" className="gap-0 px-0 py-0">
          <motion.div
            initial={false}
            animate={{ height: expanded ? 40 : 0, opacity: expanded ? 1 : 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            aria-hidden={!expanded}
            inert={!expanded}
            className="w-full overflow-hidden"
          >
            <div className="flex h-10 min-w-0 items-center gap-2 pt-1 pr-11 pl-2">
              {onPreferencesChange && (
                <ChatModelPicker
                  preferences={preferences}
                  models={availableModels}
                  disabled={pending || historyLoading || !expanded}
                  onChange={onPreferencesChange}
                  onOpenChange={setModelOpen}
                />
              )}
              {onSourcesChange && (
                <ChatContext
                  webSearchAvailable={webSearchAvailable}
                  options={contextMaterials}
                  selectedIds={selectedSourceIds}
                  minimumSources={minimumSources}
                  disabled={pending || !expanded}
                  onChange={onSourcesChange}
                  open={contextOpen}
                  onOpenChange={setContextOpen}
                  preferences={preferences}
                  onPreferencesChange={onPreferencesChange}
                  onInstructions={() => {
                    setContextOpen(false)
                    setInstructionsOpen(true)
                  }}
                  onSelectTool={onSelectTool}
                />
              )}
            </div>
          </motion.div>
          {pending && onStop ? (
            <InputGroupButton
              type="button"
              variant="default"
              size="icon-sm"
              aria-label="Stop reply"
              onClick={onStop}
              className="absolute right-2 bottom-2 size-9 rounded-full"
            >
              <Square aria-hidden="true" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              aria-label="Send question"
              disabled={
                !available ||
                !ready ||
                !draft.trim() ||
                pending ||
                historyLoading
              }
              className="absolute right-2 bottom-2 size-9 rounded-full"
            >
              {pending ? <Spinner /> : <ArrowUp aria-hidden="true" />}
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {!available && (
        <p className="px-3 text-xs text-muted-foreground">
          Chat is not available yet.
        </p>
      )}
      {onPreferencesChange && (
        <ChatInstructionsDialog
          open={instructionsOpen}
          onOpenChange={setInstructionsOpen}
          preferences={preferences}
          onChange={onPreferencesChange}
        />
      )}
    </form>
  )
}
