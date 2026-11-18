"use client"

import { useEffect, useRef, useState } from "react"
import { Pause, Play, SoundHigh, SoundOff } from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

function clock(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function StudyAudioPlayer({
  src,
  title,
  durationMs,
  onRenew,
}: {
  src?: string
  title: string
  durationMs: number
  onRenew: () => Promise<string | undefined>
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState(src)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(durationMs / 1000)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState("1")
  const [busy, setBusy] = useState(!src)
  const [error, setError] = useState("")
  const cursor = useRef(0)
  const wasPlaying = useRef(false)
  const restoring = useRef(false)
  const renewing = useRef(false)
  const automaticAttempts = useRef(0)
  const renewCallback = useRef(onRenew)
  renewCallback.current = onRenew

  useEffect(() => {
    if (src) setUrl(src)
  }, [src])

  async function recover(manual = false): Promise<void> {
    if (renewing.current) return
    if (!manual && automaticAttempts.current >= 1) {
      setBusy(false)
      setError("Audio is temporarily unavailable.")
      return
    }
    automaticAttempts.current += 1
    renewing.current = true
    restoring.current = true
    setBusy(true)
    setError("")
    try {
      const next = await renewCallback.current()
      if (!next) throw new Error("audio_unavailable")
      setUrl(next)
      // Explicit load also handles a new authorization with the same signed URL.
      if (audio.current) {
        audio.current.src = next
        audio.current.load()
      }
    } catch {
      setError("Audio is temporarily unavailable.")
      setBusy(false)
      restoring.current = false
    } finally {
      renewing.current = false
    }
  }

  useEffect(() => {
    if (!src) void recover()
  }, [])

  async function toggle(): Promise<void> {
    const element = audio.current
    if (!element) return
    if (!element.paused) {
      element.pause()
      return
    }
    wasPlaying.current = true
    setError("")
    try {
      await element.play()
    } catch {
      setPlaying(false)
      if (element.error) await recover()
      else setError("Press Play to start the audio.")
    }
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3"
      aria-label={`${title} audio player`}
    >
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        className="hidden"
        aria-label={title}
        onPlay={() => {
          wasPlaying.current = true
          setPlaying(true)
        }}
        onPause={() => {
          if (!restoring.current) wasPlaying.current = false
          setPlaying(false)
        }}
        onEnded={() => {
          wasPlaying.current = false
          setPlaying(false)
        }}
        onWaiting={() => setBusy(true)}
        onError={() => void recover()}
        onLoadedMetadata={() => {
          const element = audio.current
          if (!element) return
          if (Number.isFinite(element.duration)) setDuration(element.duration)
          element.playbackRate = Number(speed)
          element.muted = muted
          if (cursor.current > 0)
            element.currentTime = Math.min(cursor.current, element.duration)
        }}
        onCanPlay={() => {
          setBusy(false)
          setError("")
          automaticAttempts.current = 0
          const resume = restoring.current && wasPlaying.current
          restoring.current = false
          if (resume) void audio.current?.play().catch(() => setPlaying(false))
        }}
        onTimeUpdate={() => {
          if (!restoring.current && audio.current) {
            cursor.current = audio.current.currentTime
            setPosition(cursor.current)
          }
        }}
      />
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="default"
          size="icon"
          className="size-10 rounded-full"
          aria-label={playing ? "Pause audio" : "Play audio"}
          disabled={!url || (busy && !playing)}
          onClick={() => void toggle()}
        >
          {busy ? (
            <Spinner />
          ) : playing ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Slider
            thumbLabel="Playback position"
            value={[Math.min(position, duration)]}
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            disabled={!url || !duration || busy}
            className="group/audio-seek [&_[data-slot=slider-control]]:min-h-5 [&_[data-slot=slider-thumb]]:size-2 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:opacity-0 hover:[&_[data-slot=slider-thumb]]:opacity-100 [&_[data-slot=slider-thumb]:focus-visible]:opacity-100 [&_[data-slot=slider-track]]:h-0.5 [&_[data-slot=slider-track]]:bg-foreground/15"
            onValueChange={(value) => {
              const next = Array.isArray(value) ? (value[0] ?? 0) : value
              cursor.current = next
              setPosition(next)
              if (audio.current) audio.current.currentTime = next
            }}
          />
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {clock(position)}{" "}
              <span className="mx-0.5 text-muted-foreground/50">/</span>{" "}
              {clock(duration)}
            </span>
            <span>AI voice</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 min-w-9 rounded-full px-1.5 text-xs text-muted-foreground"
              />
            }
            aria-label={`Playback speed ${speed} times`}
          >
            {speed}×
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-24 rounded-xl">
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                value={speed}
                onValueChange={(value) => {
                  setSpeed(value)
                  if (audio.current) audio.current.playbackRate = Number(value)
                }}
              >
                {["0.75", "1", "1.25", "1.5", "2"].map((rate) => (
                  <DropdownMenuRadioItem key={rate} value={rate}>
                    {rate}×
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground"
          aria-label={muted ? "Unmute audio" : "Mute audio"}
          onClick={() => {
            const next = !muted
            setMuted(next)
            if (audio.current) audio.current.muted = next
          }}
        >
          {muted ? (
            <SoundOff aria-hidden="true" />
          ) : (
            <SoundHigh aria-hidden="true" />
          )}
        </Button>
      </div>
      {error && (
        <div
          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          role="status"
        >
          <span>{error}</span>
          <Button variant="ghost" size="xs" onClick={() => void recover(true)}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
