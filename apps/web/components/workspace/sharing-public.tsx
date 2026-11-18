"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Download } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Spinner } from "@workspace/ui/components/spinner"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import type { SharedOutput, SharedSourceLink } from "@/lib/sharing-types"
import { Brand } from "./brand"
import { SharingSnapshot } from "./sharing-snapshot"
import { sharingRequest } from "./sharing-request"

const tokenPattern = /^[A-Za-z0-9_-]{43}$/

export function SharedOutputPage() {
  const [output, setOutput] = useState<SharedOutput | null>(null)
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sourceError, setSourceError] = useState("")
  const [pendingSource, setPendingSource] = useState<string | null>(null)

  useEffect(() => {
    let controller: AbortController | undefined
    function load(): void {
      controller?.abort()
      const request = new AbortController()
      controller = request
      const candidate = window.location.hash.slice(1)
      setOutput(null)
      setSourceError("")
      setUnavailable(false)
      if (!tokenPattern.test(candidate)) {
        setToken("")
        setUnavailable(true)
        setLoading(false)
        return
      }
      // The fragment stays in this browser; only the Bearer header reaches the API.
      setToken(candidate)
      setLoading(true)
      sharingRequest<SharedOutput>("/api/shared", {
        credentials: "omit",
        signal: request.signal,
        headers: { Authorization: `Bearer ${candidate}` },
      })
        .then((result) => {
          if (!request.signal.aborted) setOutput(result)
        })
        .catch(() => {
          if (!request.signal.aborted) setUnavailable(true)
        })
        .finally(() => {
          if (!request.signal.aborted) setLoading(false)
        })
    }
    load()
    window.addEventListener("hashchange", load)
    return () => {
      controller?.abort()
      window.removeEventListener("hashchange", load)
    }
  }, [revision])

  async function openSource(key: string): Promise<void> {
    if (pendingSource || !token) return
    setSourceError("")
    const sourceWindow = window.open("about:blank", "_blank")
    if (!sourceWindow) {
      setSourceError(
        "Allow a new tab to open this original file, then try again."
      )
      return
    }
    sourceWindow.opener = null
    setPendingSource(key)
    try {
      const source = await sharingRequest<SharedSourceLink>(
        `/api/shared/sources/${encodeURIComponent(key)}`,
        {
          credentials: "omit",
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      sourceWindow.location.replace(source.url)
    } catch {
      sourceWindow.close()
      setSourceError(
        "This original file is unavailable. The link may have been revoked or expired."
      )
    } finally {
      setPendingSource(null)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <Brand />
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/sign-in" />}
          nativeButton={false}
          className="rounded-full"
        >
          Your workspace
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-[848px] flex-col gap-7 px-5 py-8 sm:px-8 sm:py-12">
        <h1 className="sr-only">Shared study output</h1>
        {loading ? (
          <div
            role="status"
            aria-label="Loading shared output"
            className="flex flex-col gap-5"
          >
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : unavailable || !output ? (
          <Alert className="rounded-[16px]">
            <AlertTitle>This shared output is unavailable</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col items-start gap-4">
              The link may be incomplete, expired, revoked, or its content may
              have been removed.
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary">Read-only shared output</Badge>
            </div>
            <SharingSnapshot snapshot={output.snapshot} token={token} />
            {output.includeOriginals && output.snapshot.sources.length > 0 && (
              <section
                className="flex flex-col gap-4 border-t pt-6"
                aria-label="Included original files"
              >
                <div>
                  <h2 className="text-base font-medium">
                    Included original files
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    The owner included these files. File access is checked when
                    you open one; each temporary URL lasts up to{" "}
                    {output.sourceTtlSeconds} seconds.
                  </p>
                </div>
                {output.snapshot.sources.map((source) => (
                  <div
                    key={source.key}
                    className="flex min-w-0 items-center justify-between gap-4 rounded-[16px] border p-4"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="wrap-anywhere">{source.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source.type.toUpperCase()} original
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!pendingSource}
                      onClick={() => void openSource(source.key)}
                    >
                      {pendingSource === source.key ? (
                        <Spinner />
                      ) : (
                        <Download aria-hidden="true" />
                      )}
                      Open
                    </Button>
                  </div>
                ))}
                {sourceError && (
                  <Alert variant="destructive">
                    <AlertDescription>{sourceError}</AlertDescription>
                  </Alert>
                )}
              </section>
            )}
            <footer className="border-t pt-5 text-xs leading-6 text-muted-foreground">
              <p>
                This is a fixed saved version. Private chats, assessment
                results, grading and saved study progress are not shared.
              </p>
              <p>
                {output.includeOriginals
                  ? "Original files were included by the owner."
                  : "Original files are not included."}{" "}
                Downloaded copies cannot be recalled.
              </p>
              {output.expiresAt && (
                <p>
                  Link expires{" "}
                  {new Date(output.expiresAt).toLocaleString("en-PH")}.
                </p>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  )
}
