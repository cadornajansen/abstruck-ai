"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Cube, AlignLeft } from "iconoir-react"
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/command"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { Spinner } from "@workspace/ui/components/spinner"
import { Button } from "@workspace/ui/components/button"

interface SearchResults {
  materials: {
    id: string
    title: string
    spaceId: string | null
    spaceName: string
  }[]
  spaces: { id: string; title: string }[]
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState("all")
  const [data, setData] = useState<SearchResults>({ materials: [], spaces: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(
      async () => {
        setLoading(true)
        setError("")
        try {
          const response = await fetch(
            `/api/search?q=${encodeURIComponent(query)}&scope=${scope}`,
            { signal: controller.signal }
          )
          if (!response.ok)
            throw new Error("Search is temporarily unavailable.")
          const result: SearchResults = await response.json()
          if (!controller.signal.aborted) setData(result)
        } catch {
          if (!controller.signal.aborted)
            setError("Search is temporarily unavailable. Please try again.")
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      },
      query ? 150 : 0
    )
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [open, query, scope, retry])

  function navigate(href: string) {
    onOpenChange(false)
    router.push(href)
  }
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Find your learning materials and spaces."
      showCloseButton
      className="top-1/2! h-[362px] max-h-[80svh] -translate-y-1/2! rounded-[16px]! sm:max-w-lg"
    >
      <Command
        shouldFilter={false}
        className="p-0 [&_[data-slot=command-input-wrapper]]:border-b [&_[data-slot=command-input-wrapper]]:px-0 [&_[data-slot=command-input-wrapper]]:py-0.5 [&_[data-slot=input-group-addon]]:pl-3! [&_[data-slot=input-group]]:h-10! [&_[data-slot=input-group]]:rounded-none! [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
      >
        <CommandInput
          placeholder="Search"
          aria-label="Search your workspace"
          value={query}
          onValueChange={setQuery}
          className="h-10 pr-10 text-sm"
        />
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-xs text-muted-foreground">
            {query ? "Results" : "Recents"}
          </span>
          <ToggleGroup
            value={[scope]}
            onValueChange={(values) => {
              if (values[0]) setScope(values[0])
            }}
            size="sm"
            spacing={0}
            className="h-6 rounded-full bg-muted/50 p-0.5"
          >
            <ToggleGroupItem
              value="all"
              className="h-5 rounded-full px-2 text-xs data-pressed:bg-background"
            >
              All
            </ToggleGroupItem>
            <ToggleGroupItem
              value="library"
              className="h-5 rounded-full px-2 text-xs data-pressed:bg-background"
            >
              My Library
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <CommandList className="min-h-0 flex-1 max-h-none overflow-y-auto p-1 [scrollbar-gutter:stable]">
          {loading ? (
            <div
              role="status"
              className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            >
              <Spinner />
              Searching…
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col gap-3 p-4 text-sm">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </Button>
            </div>
          ) : (
            <>
              <CommandGroup
                aria-label={query ? "Matching materials" : "Recent materials"}
              >
                {data.materials.map((material) => (
                  <CommandItem
                    key={material.id}
                    value={material.id}
                    onSelect={() => navigate(`/materials/${material.id}`)}
                    className="min-h-14 items-start gap-3 rounded-xl! px-3 py-2.5"
                  >
                    <AlignLeft
                      aria-hidden="true"
                      className="mt-0.5 text-muted-foreground"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm">{material.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {material.spaceName}
                      </span>
                    </div>
                  </CommandItem>
                ))}
                {!data.materials.length && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    {query
                      ? "No matching materials."
                      : scope === "library"
                        ? "No items in your library yet"
                        : "Your recent materials will appear here."}
                  </p>
                )}
              </CommandGroup>
              <CommandGroup
                heading="Spaces"
                className="pt-3 **:[[cmdk-group-heading]]:mb-2 **:[[cmdk-group-heading]]:font-normal"
              >
                {data.spaces.map((space) => (
                  <CommandItem
                    key={space.id}
                    value={space.id}
                    onSelect={() => navigate(`/spaces/${space.id}`)}
                    className="min-h-10 gap-3 rounded-xl! px-3"
                  >
                    <Cube
                      aria-hidden="true"
                      className="text-muted-foreground"
                    />
                    <span className="truncate text-sm">{space.title}</span>
                  </CommandItem>
                ))}
                {!data.spaces.length && (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    {query
                      ? "No matching spaces."
                      : "Your spaces will appear here."}
                  </p>
                )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
