"use client"

import { useState, type RefObject } from "react"
import Image from "next/image"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { MediaImage, Xmark } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  SPACE_COVER_BYTES,
  spaceCoverUrl,
  type SpaceDetails,
} from "@/lib/space-appearance"

export function SpaceCover({
  space,
  inputRef,
  disabled,
  onBusyChange,
  onChanged,
}: {
  space: SpaceDetails
  inputRef: RefObject<HTMLInputElement | null>
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onChanged: (patch: Partial<SpaceDetails>) => void
}) {
  const reducedMotion = useReducedMotion()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [imageFailed, setImageFailed] = useState(false)
  async function change(file: File | null): Promise<void> {
    if (pending || disabled) return
    setError("")
    if (
      file &&
      (!file.size ||
        file.size > SPACE_COVER_BYTES ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    ) {
      setError("Choose a JPG, PNG or WebP image up to 2 MB.")
      return
    }
    setPending(true)
    onBusyChange(true)
    try {
      const response = await fetch(`/api/spaces/${space.id}/cover`, {
        method: file ? "POST" : "DELETE",
        headers: {
          "X-Space-Revision": String(space.detailsRevision ?? 0),
          ...(file ? { "Content-Type": file.type } : {}),
        },
        body: file ?? undefined,
      })
      const result = (await response.json()) as {
        revision: number
        hasCover: boolean
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? "Your cover could not be saved.")
      setImageFailed(false)
      onChanged({ detailsRevision: result.revision, hasCover: result.hasCover })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Connection interrupted. Try again."
      )
    } finally {
      setPending(false)
      onBusyChange(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }
  return (
    <>
      <Input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose space cover"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void change(file)
        }}
      />
      <AnimatePresence initial={false}>
        {space.hasCover && (
          <motion.section
            key={space.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            aria-label="Space cover"
            className="overflow-hidden"
          >
            <div className="group/space-cover relative h-40 w-full bg-muted sm:h-64">
              <Image
                src={spaceCoverUrl(space)}
                alt={`${space.title} cover`}
                width={1920}
                height={400}
                unoptimized
                className="size-full object-cover"
                onError={() => setImageFailed(true)}
                onLoad={() => setImageFailed(false)}
              />
              {imageFailed && (
                <p
                  role="status"
                  className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground"
                >
                  Cover is temporarily unavailable.
                </p>
              )}
              <div className="absolute right-4 bottom-4 flex gap-2 opacity-0 transition-opacity duration-150 group-focus-within/space-cover:opacity-100 group-hover/space-cover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending || disabled}
                  onClick={() => inputRef.current?.click()}
                >
                  <MediaImage data-icon="inline-start" />
                  Change cover
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending || disabled}
                  onClick={() => void change(null)}
                >
                  <Xmark data-icon="inline-start" />
                  Remove cover
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      {pending && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
        >
          <Spinner />
          Saving cover…
        </p>
      )}
      {error && (
        <p role="alert" className="px-6 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
