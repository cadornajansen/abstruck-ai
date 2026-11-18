"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type {
  PodcastOutput,
  StudyOutputArtifact,
  StudyOutputCitation,
  VideoOutput,
} from "@/lib/study-output-types"
import { StudyOutputCitations } from "./study-output-citations"
import { StudyAudioPlayer } from "./study-audio-player"

export function StudyOutputMedia({
  output,
  artifact,
  onRenew,
  onCitation,
}: {
  output: PodcastOutput | VideoOutput
  artifact?: StudyOutputArtifact
  onRenew: () => Promise<StudyOutputArtifact | undefined>
  onCitation: (citation: StudyOutputCitation) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState(
    artifact?.mime === "video/mp4" ? artifact.url : undefined
  )
  const [videoError, setVideoError] = useState("")
  const restoring = useRef(false)
  const renewing = useRef(false)
  const attempts = useRef(0)
  const cursor = useRef(0)
  const wasPlaying = useRef(false)
  const renewCallback = useRef(onRenew)
  renewCallback.current = onRenew

  useEffect(() => {
    if (output.kind === "video" && !artifact) void renewVideo()
  }, [])

  useEffect(() => {
    if (artifact?.mime === "video/mp4") setVideoUrl(artifact.url)
  }, [artifact?.url, artifact?.mime])

  async function renewVideo(manual = false): Promise<void> {
    if (renewing.current) return
    if (!manual && attempts.current >= 1) {
      setVideoError("Video is temporarily unavailable.")
      return
    }
    attempts.current += 1
    renewing.current = true
    restoring.current = true
    setVideoError("")
    try {
      const next = await renewCallback.current()
      if (next?.mime !== "video/mp4") throw new Error("video_unavailable")
      setVideoUrl(next.url)
      if (video.current) {
        video.current.src = next.url
        video.current.load()
      }
    } catch {
      setVideoError("Video is temporarily unavailable.")
      restoring.current = false
    } finally {
      renewing.current = false
    }
  }

  const speakers =
    output.kind === "podcast"
      ? new Set(output.script.map((part) => part.speaker)).size
      : 0

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {output.kind === "podcast" ? (
        <StudyAudioPlayer
          src={artifact?.mime === "audio/mpeg" ? artifact.url : undefined}
          title={output.title}
          durationMs={artifact?.durationMs ?? 0}
          onRenew={async () => (await renewCallback.current())?.url}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <video
            ref={video}
            aria-label={output.title}
            controls
            playsInline
            preload="metadata"
            src={videoUrl}
            className="aspect-video w-full rounded-xl bg-muted"
            onPlay={() => {
              wasPlaying.current = true
            }}
            onPause={() => {
              if (!restoring.current) wasPlaying.current = false
            }}
            onTimeUpdate={() => {
              if (!restoring.current && video.current)
                cursor.current = video.current.currentTime
            }}
            onLoadedMetadata={() => {
              if (video.current && cursor.current > 0)
                video.current.currentTime = Math.min(
                  cursor.current,
                  video.current.duration
                )
            }}
            onCanPlay={() => {
              setVideoError("")
              attempts.current = 0
              const resume = restoring.current && wasPlaying.current
              restoring.current = false
              if (resume) void video.current?.play().catch(() => {})
            }}
            onError={() => void renewVideo()}
          />
          {videoError && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
            >
              <span>{videoError}</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void renewVideo(true)}
              >
                Try again
              </Button>
            </div>
          )}
        </div>
      )}
      <section aria-label="Saved script" className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">Script</h3>
        {output.kind === "podcast"
          ? output.script.map((part, index) => (
              <div key={index} className="flex flex-col gap-2">
                {speakers > 1 && (
                  <p className="text-xs font-medium text-muted-foreground">
                    {part.speaker}
                  </p>
                )}
                <p className="text-sm leading-7 whitespace-pre-wrap">
                  {part.text}
                </p>
                <StudyOutputCitations
                  citations={part.citations}
                  onCitation={onCitation}
                />
              </div>
            ))
          : output.slides.map((slide, index) => (
              <article
                key={slide.id}
                className="flex flex-col gap-3 rounded-xl border p-4"
              >
                <h4 className="font-medium">
                  {index + 1}. {slide.title}
                </h4>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                  {slide.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
                <p className="text-sm leading-6 whitespace-pre-wrap">
                  {slide.narration}
                </p>
                <StudyOutputCitations
                  citations={slide.citations}
                  onCitation={onCitation}
                />
              </article>
            ))}
      </section>
    </div>
  )
}
