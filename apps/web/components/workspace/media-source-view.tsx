"use client"

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowSeparateVertical,
  NavArrowDown,
  NavArrowUp,
  Text,
  EditPencil,
  Book,
} from "iconoir-react"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import { formatSourceTime } from "@/lib/source-position"
import { YouTubePlayer, type YouTubePlayback } from "./youtube-player"
import {
  MediaAnnotationRail,
  mediaAnnotationSurfaces,
  useMediaAnnotations,
  type MediaAnnotationContext,
} from "./media-annotations"

export interface TranscriptSegment {
  id: string
  ordinal: number
  text: string
  startMs: number
  endMs: number
  speaker: string | null
}
export interface MaterialChapter {
  startMs: number
  endMs: number
  title: string
  summary: string
}
export interface MaterialMedia {
  kind: "audio" | "video"
  url: string
  mime: string
  durationMs: number
  audioUrl?: string
  youtubeId?: string
  segments: TranscriptSegment[]
  chapters?: MaterialChapter[]
  chaptersStatus?: "ready" | "unavailable"
}

export interface MediaPlayback {
  readonly currentTime: number
}

export function MediaSourceView({
  media,
  title,
  initialTimeMs,
  seek,
  onPositionChange,
  onRefresh,
  compact = false,
  playerRef,
  annotationContext,
}: {
  media: MaterialMedia
  title: string
  initialTimeMs: number
  seek: { timeMs: number; revision: number } | null
  onPositionChange?: (timeMs: number, ordinal: number) => void
  onRefresh?: () => void
  compact?: boolean
  playerRef?: RefObject<MediaPlayback | null>
  annotationContext?: MediaAnnotationContext
}) {
  const player = useRef<HTMLMediaElement | null>(null)
  const youtubePlayer = useRef<YouTubePlayback | null>(null)
  const [playerRevision, setPlayerRevision] = useState(0)
  const reduceMotion = useReducedMotion()
  const savedPosition = useRef(initialTimeMs)
  const lastReported = useRef(initialTimeMs)
  const wasPlaying = useRef(false)
  const rows = useRef(new Map<string, HTMLElement>())
  const [position, setPosition] = useState(initialTimeMs)
  const annotations = useMediaAnnotations(annotationContext)
  const highlightedSegments = new Map(
    annotations.annotations
      .filter(
        (item) =>
          item.extractionVersion === annotationContext?.extractionVersion &&
          !annotations.sourceChanged
      )
      .map((item) => [item.locator.segmentId, item.color])
  )
  const [tab, setTab] = useState(
    media.chapters?.length ? "chapters" : "transcripts"
  )
  const tabChosen = useRef(false)
  useEffect(() => {
    if (!tabChosen.current && media.chapters?.length) setTab("chapters")
  }, [media.chapters?.length])
  const [minimized, setMinimized] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [audioOnly, setAudioOnly] = useState(false)
  // Renewed signed links are used on recovery, without restarting active playback.
  const [playbackUrl, setPlaybackUrl] = useState(media.url)
  const [error, setError] = useState("")
  const [captionsUrl, setCaptionsUrl] = useState("")
  function bindPlayer(node: HTMLMediaElement | null) {
    player.current = node
    if (playerRef) playerRef.current = node
  }
  const active =
    media.segments.find(
      (segment) => position >= segment.startMs && position < segment.endMs
    ) ??
    (position < (media.segments[0]?.startMs ?? 0)
      ? media.segments[0]
      : undefined)
  const chapterIndex =
    media.chapters?.findIndex(
      (chapter) => position >= chapter.startMs && position < chapter.endMs
    ) ?? -1
  const activeRow = tab === "chapters" ? `chapter-${chapterIndex}` : active?.id
  const captions = useMemo(() => {
    const stamp = (value: number) =>
      new Date(Math.max(0, value)).toISOString().slice(11, 23)
    return (
      "WEBVTT\n\n" +
      media.segments
        .map(
          (segment, index) =>
            `${index + 1}\n${stamp(segment.startMs)} --> ${stamp(segment.endMs)}\n${segment.text
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replace(/[\r\n]+/g, " ")}\n`
        )
        .join("\n")
    )
  }, [media.segments])

  function report(timeMs: number) {
    lastReported.current = timeMs
    const segment = media.segments.find(
      (item) => timeMs >= item.startMs && timeMs < item.endMs
    )
    onPositionChange?.(Math.round(timeMs), segment?.ordinal ?? 1)
  }
  function seekTo(timeMs: number) {
    const target = Math.max(0, Math.min(media.durationMs, timeMs))
    savedPosition.current = target
    setPosition(target)
    if (youtubePlayer.current && !audioOnly)
      youtubePlayer.current.seekTo(target / 1000)
    else if (player.current) player.current.currentTime = target / 1000
    report(target)
  }
  const applySeek = useEffectEvent((timeMs: number) => seekTo(timeMs))
  useEffect(() => {
    if (seek) applySeek(seek.timeMs)
  }, [seek])
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([captions], { type: "text/vtt" }))
    setCaptionsUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [captions])
  useEffect(() => {
    const next = audioOnly ? (media.audioUrl ?? media.url) : media.url
    if (error && next !== playbackUrl) {
      setPlaybackUrl(next)
      setError("")
    }
  }, [media.url, media.audioUrl, audioOnly, error, playbackUrl])
  useEffect(() => {
    if (autoScroll && activeRow && !compact)
      rows.current.get(activeRow)?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      })
  }, [activeRow, autoScroll, compact])

  function refreshPlayer() {
    onRefresh?.()
    if (media.youtubeId && !audioOnly) {
      setPlayerRevision((value) => value + 1)
      setError("")
      return
    }
    const next = audioOnly ? (media.audioUrl ?? media.url) : media.url
    if (next !== playbackUrl) {
      setPlaybackUrl(next)
      setError("")
    } else player.current?.load()
  }
  function updatePlaybackPosition(next: number) {
    savedPosition.current = next
    const nextSegment = media.segments.find(
      (segment) => next >= segment.startMs && next < segment.endMs
    )
    const nextChapter =
      media.chapters?.findIndex(
        (chapter) => next >= chapter.startMs && next < chapter.endMs
      ) ?? -1
    if (nextSegment?.id !== active?.id || nextChapter !== chapterIndex)
      setPosition(next)
    if (Math.abs(next - lastReported.current) >= 10_000) report(next)
  }
  const nativeProps = {
    preload: "metadata" as const,
    src: playbackUrl,
    "aria-label": title,
    onLoadedMetadata: () => {
      if (!player.current) return
      player.current.currentTime = Math.min(
        savedPosition.current / 1000,
        player.current.duration || 0
      )
      if (wasPlaying.current)
        void player.current.play().catch(() => {
          wasPlaying.current = false
        })
    },
    onTimeUpdate: () => {
      if (!player.current) return
      updatePlaybackPosition(Math.round(player.current.currentTime * 1000))
    },
    onPlay: () => {
      wasPlaying.current = true
    },
    onPause: () => {
      wasPlaying.current = false
      report(savedPosition.current)
    },
    onEnded: () => {
      wasPlaying.current = false
      report(savedPosition.current)
    },
    onSeeked: () => {
      if (player.current) {
        savedPosition.current = Math.round(player.current.currentTime * 1000)
        report(savedPosition.current)
      }
    },
    onError: () =>
      setError(
        "Playback could not load. Refresh the player or use the transcript."
      ),
    onCanPlay: () => setError(""),
  }
  return (
    <div className={cn("flex min-h-0", !compact && "h-full")}>
      {annotationContext && (
        <MediaAnnotationRail
          state={annotations}
          compact={compact}
          onRefreshSource={onRefresh}
          onSeek={(timeMs) => {
            tabChosen.current = true
            setTab("transcripts")
            seekTo(timeMs)
          }}
        />
      )}
      <div className="@container/media-source flex min-h-0 min-w-0 flex-1 flex-col">
        <motion.div
          initial={false}
          animate={{
            height: !minimized || compact ? "auto" : 0,
            opacity: !minimized || compact ? 1 : 0,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          inert={minimized && !compact}
          aria-hidden={minimized && !compact}
          className={cn("shrink-0 overflow-hidden", !compact && "rounded-2xl")}
        >
          {media.youtubeId && !audioOnly ? (
            <YouTubePlayer
              key={`${media.youtubeId}:${playerRevision}`}
              videoId={media.youtubeId}
              title={title}
              initialTimeMs={savedPosition.current}
              onPlayer={(node) => {
                youtubePlayer.current = node
                if (playerRef) playerRef.current = node
              }}
              onPosition={updatePlaybackPosition}
              onPause={(timeMs) => {
                updatePlaybackPosition(timeMs)
                report(timeMs)
              }}
              onError={() =>
                setError(
                  "This video could not play here. Open it on YouTube, refresh the player or listen to the available audio."
                )
              }
            />
          ) : media.kind === "video" && !audioOnly ? (
            <video
              ref={bindPlayer}
              {...nativeProps}
              controls
              playsInline
              className={cn(
                "aspect-video w-full rounded-2xl bg-muted",
                compact && "rounded-none"
              )}
            >
              {captionsUrl && (
                <track
                  kind="captions"
                  src={captionsUrl}
                  srcLang="und"
                  label="Transcript"
                />
              )}
            </video>
          ) : (
            <audio
              ref={bindPlayer}
              {...nativeProps}
              controls
              className="w-full"
            />
          )}
        </motion.div>
        {audioOnly && media.kind === "video" && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-fit shrink-0"
            onClick={() => {
              setAudioOnly(false)
              setPlaybackUrl(media.url)
              setPlayerRevision((value) => value + 1)
              setError("")
            }}
          >
            Back to video
          </Button>
        )}
        {error && (
          <Alert className="mt-3 shrink-0">
            <AlertDescription>
              {error}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={refreshPlayer}>
                  Refresh player
                </Button>
                {media.youtubeId && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`https://www.youtube.com/watch?v=${media.youtubeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    nativeButton={false}
                  >
                    Open on YouTube
                  </Button>
                )}
                {media.kind === "video" && !audioOnly && media.audioUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAudioOnly(true)
                      setPlaybackUrl(media.audioUrl!)
                      setError("")
                    }}
                  >
                    Listen to audio
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
        {compact && annotationContext && (
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant={annotations.open ? "secondary" : "ghost"}
              size="sm"
              aria-expanded={annotations.open}
              className="h-10 rounded-2xl px-3 font-normal"
              onClick={() => annotations.setOpen(!annotations.open)}
            >
              <EditPencil data-icon="inline-start" aria-hidden="true" />{" "}
              Annotations
              {annotations.annotations.length
                ? ` (${annotations.annotations.length})`
                : ""}
            </Button>
            {active && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 rounded-2xl px-3 font-normal"
                disabled={
                  !!annotations.busyId ||
                  annotations.loading ||
                  annotations.sourceChanged
                }
                onClick={() => void annotations.highlight(active)}
              >
                Highlight passage at {formatSourceTime(active.startMs)}
              </Button>
            )}
          </div>
        )}
        {!compact && (
          <Tabs
            value={tab}
            onValueChange={(value) => {
              tabChosen.current = true
              setTab(String(value))
            }}
            className="min-h-0 flex-1 gap-2"
          >
            <div
              className={cn(
                "flex min-w-0 shrink-0 items-center gap-2",
                !minimized && "mt-4"
              )}
            >
              <TabsList className="shrink-0 gap-0 rounded-2xl border border-border/60 bg-transparent p-1 group-data-horizontal/tabs:h-10">
                <TabsTrigger
                  value="chapters"
                  disabled={!media.chapters?.length}
                  title={
                    !media.chapters?.length
                      ? "Chapters were not available for this material"
                      : undefined
                  }
                  className="h-full gap-2 rounded-xl px-3 font-normal shadow-none! @max-[26rem]/media-source:px-2 data-active:bg-muted"
                >
                  <span
                    className="flex size-4 items-center justify-center"
                    aria-hidden="true"
                  >
                    {tab === "chapters" ? (
                      <span className="size-2 rounded-full bg-plan-foreground" />
                    ) : (
                      <Book />
                    )}
                  </span>
                  <span className="@max-[26rem]/media-source:sr-only">
                    Chapters
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="transcripts"
                  onClick={() => {
                    tabChosen.current = true
                  }}
                  className="h-full gap-2 rounded-xl px-3 font-normal shadow-none! @max-[26rem]/media-source:px-2 data-active:bg-muted"
                >
                  <span
                    className="flex size-4 items-center justify-center"
                    aria-hidden="true"
                  >
                    {tab === "transcripts" ? (
                      <span className="size-2 rounded-full bg-plan-foreground" />
                    ) : (
                      <Text />
                    )}
                  </span>
                  <span className="@max-[26rem]/media-source:sr-only">
                    Transcripts
                  </span>
                </TabsTrigger>
              </TabsList>
              {annotationContext && (
                <Button
                  variant={annotations.open ? "secondary" : "outline"}
                  size="icon"
                  className="ml-auto size-10 rounded-2xl"
                  aria-label={`Annotations${annotations.annotations.length ? ` (${annotations.annotations.length})` : ""}`}
                  title={`Annotations${annotations.annotations.length ? ` (${annotations.annotations.length})` : ""}`}
                  aria-expanded={annotations.open}
                  onClick={() => annotations.setOpen(!annotations.open)}
                >
                  <EditPencil aria-hidden="true" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                aria-pressed={autoScroll}
                aria-label="Auto Scroll"
                onClick={() => setAutoScroll((value) => !value)}
                className={cn(
                  "h-10 rounded-2xl px-3 font-normal @max-[34rem]/media-source:size-10 @max-[34rem]/media-source:px-0",
                  !annotationContext && "ml-auto",
                  autoScroll && "bg-muted"
                )}
              >
                <ArrowSeparateVertical
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                <span className="@max-[34rem]/media-source:sr-only">
                  Auto Scroll
                </span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={minimized ? "Maximize" : "Minimize"}
                onClick={() => setMinimized((value) => !value)}
                className="size-10 rounded-2xl"
              >
                {minimized ? (
                  <NavArrowDown aria-hidden="true" />
                ) : (
                  <NavArrowUp aria-hidden="true" />
                )}
              </Button>
            </div>
            <TabsContent
              value="chapters"
              className="min-h-0 overflow-y-auto rounded-2xl"
            >
              <ol className="flex flex-col gap-2">
                {media.chapters?.map((chapter, index) => (
                  <li
                    key={`${chapter.startMs}-${index}`}
                    ref={(node) => {
                      if (node) rows.current.set(`chapter-${index}`, node)
                      else rows.current.delete(`chapter-${index}`)
                    }}
                  >
                    <Button
                      variant="ghost"
                      aria-current={chapterIndex === index ? "true" : undefined}
                      onClick={() => seekTo(chapter.startMs)}
                      className={cn(
                        "h-auto w-full flex-col items-start gap-2 rounded-2xl px-5 py-4 text-left font-normal whitespace-normal",
                        chapterIndex === index && "bg-muted"
                      )}
                    >
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatSourceTime(chapter.startMs)}
                      </span>
                      <span className="text-base font-medium">
                        {chapter.title}
                      </span>
                      <span className="text-sm leading-6 text-muted-foreground">
                        {chapter.summary}
                      </span>
                    </Button>
                  </li>
                ))}
              </ol>
            </TabsContent>
            <TabsContent
              value="transcripts"
              className="min-h-0 overflow-y-auto rounded-2xl"
            >
              {media.segments.length ? (
                <ol className="flex flex-col gap-2">
                  {media.segments.map((segment) => (
                    <li
                      key={segment.id}
                      className="group/transcript relative"
                      ref={(node) => {
                        if (node) rows.current.set(segment.id, node)
                        else rows.current.delete(segment.id)
                      }}
                    >
                      <Button
                        variant="ghost"
                        aria-current={
                          active?.id === segment.id ? "true" : undefined
                        }
                        onClick={() => seekTo(segment.startMs)}
                        className={cn(
                          "h-auto w-full flex-col items-start gap-2 rounded-2xl px-5 py-4 text-left font-normal whitespace-normal",
                          active?.id === segment.id && "bg-muted",
                          annotationContext && "pr-14",
                          highlightedSegments.has(segment.id) &&
                            mediaAnnotationSurfaces[
                              highlightedSegments.get(segment.id)!
                            ]
                        )}
                      >
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatSourceTime(segment.startMs)}
                          {segment.speaker
                            ? ` · Speaker ${segment.speaker}`
                            : ""}
                        </span>
                        <span className="text-base leading-7">
                          {segment.text}
                        </span>
                      </Button>
                      {annotationContext && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-3 right-3 opacity-0 group-focus-within/transcript:opacity-100 group-hover/transcript:opacity-100 [@media(hover:none)]:opacity-100"
                          aria-label={`${highlightedSegments.has(segment.id) ? "Open annotation" : "Highlight transcript"} at ${formatSourceTime(segment.startMs)}`}
                          disabled={
                            !!annotations.busyId ||
                            annotations.loading ||
                            annotations.sourceChanged
                          }
                          onClick={() => void annotations.highlight(segment)}
                        >
                          <EditPencil aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Transcript not available yet</EmptyTitle>
                    <EmptyDescription>
                      Your transcript will appear when processing finishes.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
