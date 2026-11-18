"use client"

import { useId, useState } from "react"
import { AlignLeft, Search } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"

export interface AssessmentSource {
  id: string
  title: string
}

export function AssessmentSourcePicker({
  sources,
  sourceTitle = "Materials",
  selectedIds,
  disabled,
  onChange,
}: {
  sources: AssessmentSource[]
  sourceTitle?: string
  selectedIds: string[]
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const id = useId()
  const [search, setSearch] = useState("")
  const filtered = sources.filter((source) =>
    source.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  )
  const selection = filtered.slice(0, 3).map((source) => source.id)
  const allSelected =
    selection.length > 0 &&
    selection.every((sourceId) => selectedIds.includes(sourceId))

  return (
    <FieldSet className="gap-3">
      <FieldLegend className="mb-0">Source Material</FieldLegend>
      <div className="flex flex-col gap-1 rounded-[24px] border p-2">
        <InputGroup className="h-9 border-0 shadow-none">
          <InputGroupInput
            aria-label={`Search materials in ${sourceTitle}`}
            placeholder={sourceTitle}
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            className="px-3 text-base placeholder:text-foreground"
          />
          <InputGroupAddon align="inline-end" className="pr-3">
            <Search aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex min-h-6 items-center justify-end px-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || selection.length === 0}
            onClick={() =>
              onChange(
                allSelected
                  ? selectedIds.filter(
                      (sourceId) => !selection.includes(sourceId)
                    )
                  : selection
              )
            }
            className="font-normal text-muted-foreground"
          >
            {allSelected
              ? "Deselect All"
              : filtered.length > 3
                ? "Select first 3"
                : "Select All"}
          </Button>
        </div>
        <FieldGroup className="max-h-48 gap-1 overflow-y-auto">
          {filtered.map((source) => {
            const selected = selectedIds.includes(source.id)
            return (
              <Field key={source.id} orientation="horizontal">
                <FieldLabel
                  htmlFor={`${id}-${source.id}`}
                  className="w-full min-w-0 cursor-pointer items-center gap-3 rounded-full px-3 py-2 font-normal transition-colors has-data-checked:bg-muted has-[:disabled]:cursor-default has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <Checkbox
                    id={`${id}-${source.id}`}
                    checked={selected}
                    disabled={
                      disabled || (!selected && selectedIds.length >= 3)
                    }
                    onCheckedChange={(checked) =>
                      onChange(
                        checked
                          ? [...selectedIds, source.id]
                          : selectedIds.filter(
                              (sourceId) => sourceId !== source.id
                            )
                      )
                    }
                    className="sr-only"
                  />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
                    <AlignLeft className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 truncate">{source.title}</span>
                </FieldLabel>
              </Field>
            )
          })}
        </FieldGroup>
        {filtered.length === 0 && (
          <FieldDescription className="px-3 py-2">
            {sources.length
              ? "No materials match your search."
              : "No ready materials yet."}
          </FieldDescription>
        )}
      </div>
      <FieldDescription className="sr-only">
        Choose up to three ready materials.
      </FieldDescription>
    </FieldSet>
  )
}
