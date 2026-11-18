"use client"

import { useEffect, useState } from "react"
import { Search } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import {
  spaceIconNames,
  spaceIconColors,
  type SpaceAppearance,
  type SpaceIconName,
} from "@/lib/space-appearance"
import { SpaceIcon } from "./space-icon"

export function SpaceIconPicker({
  space,
  open,
  onOpenChange,
  onSave,
  pending,
  error,
}: {
  space: SpaceAppearance
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (icon: { name: SpaceIconName; color: string } | null) => Promise<void>
  pending: boolean
  error: string
}) {
  const [name, setName] = useState<SpaceIconName | null>(space.iconName ?? null)
  const [color, setColor] = useState(space.iconColor ?? "#404040")
  const [query, setQuery] = useState("")
  useEffect(() => {
    if (open) {
      setName(space.iconName ?? null)
      setColor(space.iconColor ?? "#404040")
      setQuery("")
    }
  }, [open, space.iconName, space.iconColor])
  const validColor = /^#[0-9a-f]{6}$/i.test(color)
  const filtered = spaceIconNames.filter((item) =>
    item
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  async function save(remove = false): Promise<void> {
    if (!remove && (!name || !validColor)) return
    try {
      await onSave(remove ? null : { name: name!, color })
      onOpenChange(false)
    } catch {
      /* Keep the choice and show the server error in this dialog. */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-h-[90dvh] gap-5 overflow-y-auto rounded-2xl sm:max-w-lg"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a space icon and its color.
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search icons…"
            aria-label="Search icons"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div
          className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto rounded-2xl border p-2 sm:grid-cols-8"
          aria-label="Space icons"
        >
          {filtered.map((item) => (
            <Button
              key={item}
              variant="ghost"
              size="icon-lg"
              disabled={pending}
              title={item.replace(/([a-z])([A-Z])/g, "$1 $2")}
              aria-label={`Use ${item} icon`}
              aria-pressed={name === item}
              className={cn(
                "rounded-xl text-muted-foreground",
                name === item && "bg-muted text-foreground"
              )}
              onClick={() => setName(item)}
            >
              <SpaceIcon space={{ iconName: item, iconColor: "#737373" }} />
            </Button>
          ))}
          {!filtered.length && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No matching icons.
            </p>
          )}
        </div>
        <Field
          className="gap-3 rounded-2xl border p-4"
          data-invalid={!validColor}
        >
          <FieldLabel className="sr-only" htmlFor="space-icon-hex">
            Icon color
          </FieldLabel>
          <div className="grid grid-cols-10 gap-2" aria-label="Icon colors">
            {spaceIconColors.map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="icon-sm"
                aria-label={`Use color ${item}`}
                aria-pressed={color.toUpperCase() === item.toUpperCase()}
                disabled={pending}
                className="size-7 rounded-full p-0"
                onClick={() => setColor(item)}
              >
                <svg aria-hidden="true" viewBox="0 0 28 28" className="size-7">
                  <circle cx="14" cy="14" r="11" fill={item} />
                  {color.toUpperCase() === item.toUpperCase() && (
                    <circle
                      cx="14"
                      cy="14"
                      r="13"
                      fill="none"
                      stroke={item}
                      strokeWidth="1"
                    />
                  )}
                </svg>
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Input
              type="color"
              aria-label="Choose custom icon color"
              value={validColor ? color : "#404040"}
              disabled={pending}
              className="size-9 cursor-pointer rounded-lg p-1"
              onChange={(event) => setColor(event.target.value)}
            />
            <Input
              id="space-icon-hex"
              value={color}
              maxLength={7}
              aria-invalid={!validColor}
              disabled={pending}
              className="w-28"
              onChange={(event) =>
                setColor(
                  event.target.value.startsWith("#")
                    ? event.target.value
                    : `#${event.target.value}`
                )
              }
            />
            {name && (
              <SpaceIcon
                className="ml-auto size-7"
                space={{
                  iconName: name,
                  iconColor: validColor ? color : undefined,
                }}
              />
            )}
          </div>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            disabled={pending || !space.iconName}
            onClick={() => void save(true)}
          >
            Remove icon
          </Button>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={pending || !name || !validColor}
              onClick={() => void save()}
            >
              {pending && <Spinner />}Confirm
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
