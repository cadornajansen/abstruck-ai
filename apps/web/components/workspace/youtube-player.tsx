"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { Spinner } from "@workspace/ui/components/spinner"

interface YouTubePlayerInstance {
  getCurrentTime(): number
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  pauseVideo(): void
  destroy(): void
}
interface YouTubeApi {
  Player: new (
    iframe: HTMLIFrameElement,
    options: {
      events: {
        onReady: (event: { target: YouTubePlayerInstance }) => void
        onStateChange: (event: { data: number }) => void
        onError: () => void
      }
    }
  ) => YouTubePlayerInstance
}
declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

export interface YouTubePlayback {
  readonly currentTime: number
  seekTo(seconds: number): void
}

let apiRequest: Promise<YouTubeApi> | null = null
function loadPlayerApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiRequest) return apiRequest
  apiRequest = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    script.async = true
    const timeout = window.setTimeout(fail, 15_000)
    function fail() {
      window.clearTimeout(timeout)
      script.remove()
      apiRequest = null
      reject(new Error("The YouTube player could not load."))
    }
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout)
      try {
        previous?.()
      } finally {
        if (window.YT?.Player) resolve(window.YT)
        else fail()
      }
    }
    script.addEventListener("error", fail, { once: true })
    document.head.append(script)
  })
  return apiRequest
}

export function YouTubePlayer({
  videoId,
  title,
  initialTimeMs,
  onPlayer,
  onPosition,
  onPause,
  onError,
}: {
  videoId: string
  title: string
  initialTimeMs: number
  onPlayer: (player: YouTubePlayback | null) => void
  onPosition: (timeMs: number) => void
  onPause: (timeMs: number) => void
  onError: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const publishPlayer = useEffectEvent(onPlayer)
  const publishPosition = useEffectEvent(onPosition)
  const publishPause = useEffectEvent(onPause)
  const publishError = useEffectEvent(onError)
  const startAt = useEffectEvent(() => initialTimeMs)

  useEffect(() => {
    if (!host.current || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return
    const container = host.current
    let disposed = false
    let instance: YouTubePlayerInstance | undefined
    let clock: number | undefined
    let readyDeadline: number | undefined
    setReady(false)

    function stopClock() {
      window.clearInterval(clock)
      clock = undefined
    }
    function currentTime(): number {
      return Math.max(0, Number(instance?.getCurrentTime()) || 0)
    }
    function seekTo(seconds: number) {
      if (!instance) return
      const playing = instance.getPlayerState() === 1
      instance.seekTo(Math.max(0, seconds), true)
      // Seeking an unstarted/cued YouTube video otherwise starts playback.
      if (!playing) instance.pauseVideo()
    }

    async function mount() {
      try {
        const api = await loadPlayerApi()
        if (disposed) return
        // YouTube owns this iframe; React owns only its stable host element.
        const iframe = document.createElement("iframe")
        const params = new URLSearchParams({
          enablejsapi: "1",
          origin: window.location.origin,
          playsinline: "1",
          rel: "0",
        })
        iframe.src = `https://www.youtube.com/embed/${videoId}?${params}`
        iframe.title = title
        iframe.className = "absolute inset-0 size-full border-0"
        iframe.allow =
          "autoplay; encrypted-media; picture-in-picture; fullscreen"
        iframe.allowFullscreen = true
        iframe.referrerPolicy = "strict-origin-when-cross-origin"
        container.replaceChildren(iframe)
        readyDeadline = window.setTimeout(() => {
          if (!disposed) {
            setReady(true)
            publishError()
          }
        }, 15_000)
        instance = new api.Player(iframe, {
          events: {
            onReady: () => {
              if (disposed) return
              window.clearTimeout(readyDeadline)
              setReady(true)
              publishPlayer({
                get currentTime() {
                  return currentTime()
                },
                seekTo,
              })
              if (startAt() > 0) seekTo(startAt() / 1000)
            },
            onStateChange: ({ data }) => {
              if (disposed) return
              stopClock()
              if (data === 1)
                clock = window.setInterval(
                  () => publishPosition(Math.round(currentTime() * 1000)),
                  500
                )
              if (data === 0 || data === 2)
                publishPause(Math.round(currentTime() * 1000))
            },
            onError: () => {
              if (!disposed) {
                stopClock()
                window.clearTimeout(readyDeadline)
                setReady(true)
                publishError()
              }
            },
          },
        })
      } catch {
        if (!disposed) {
          setReady(true)
          publishError()
        }
      }
    }
    void mount()
    return () => {
      disposed = true
      stopClock()
      window.clearTimeout(readyDeadline)
      publishPlayer(null)
      instance?.destroy()
      container.replaceChildren()
    }
  }, [videoId, title])

  return (
    <div className="relative aspect-video w-full bg-muted">
      <div ref={host} className="absolute inset-0" />
      {!ready && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner /> Loading video…
        </div>
      )}
    </div>
  )
}
