"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import type { CreateSpaceAction } from "@/components/workspace/create-space-dialog"

export function useCreateSpace(action: CreateSpaceAction | undefined) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const pendingRef = useRef(false)
  const spaceIdRef = useRef<string | null>(null)
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    pendingRef.current = false
    spaceIdRef.current = null
    setPending(false)
    setError("")
  }, [pathname])

  const createSpace = useCallback(async (): Promise<void> => {
    if (!action || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError("")
    try {
      spaceIdRef.current ??= crypto.randomUUID()
      const form = new FormData()
      form.set("spaceId", spaceIdRef.current)
      const result = await action(form)
      if (result.error || !result.id)
        throw new Error(
          result.error ?? "Your space could not be created. Please try again."
        )
      router.push(`/spaces/${encodeURIComponent(result.id)}`)
      router.refresh()
      // Keep the click guard until navigation commits, including slow page loads.
    } catch (cause) {
      pendingRef.current = false
      setPending(false)
      setError(
        cause instanceof Error
          ? cause.message
          : "Your space could not be created. Please try again."
      )
    }
  }, [action, router])

  return { createSpace, pending, error }
}
