'use client'

import { useRef, useState } from 'react'
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DetectionPreviewEntry } from '@/lib/api'
import { formatSegmentTime, type AnalysisSegment, type TrackingTarget } from '@/lib/processing-config'
import { DetectionOverlay } from './DetectionOverlay'

interface Props {
  videoUrl: string | null
  segment: AnalysisSegment | null
  detections: DetectionPreviewEntry[]
  targets: TrackingTarget[]
  loading: boolean
  onFrameSettled: (atSec: number) => void
  onToggle: (det: DetectionPreviewEntry) => void
}

export function SelectionPlayer({
  videoUrl,
  segment,
  detections,
  targets,
  loading,
  onFrameSettled,
  onToggle,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(segment?.start_sec ?? 0)
  const [duration, setDuration] = useState(0)

  const minTime = segment?.start_sec ?? 0
  const maxTime = segment?.end_sec ?? duration

  function clamp(t: number): number {
    return Math.max(minTime, Math.min(maxTime || t, t))
  }

  function seekTo(t: number, settle: boolean) {
    const video = videoRef.current
    if (!video) return
    const next = clamp(t)
    video.currentTime = next
    setCurrentTime(next)
    if (settle) onFrameSettled(next)
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration || 0)
    const start = segment?.start_sec ?? 0
    if (start > 0) video.currentTime = start
    setCurrentTime(start)
    onFrameSettled(start)
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <div className="flex aspect-video items-center justify-center">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => {
                setPlaying(false)
                onFrameSettled(videoRef.current?.currentTime ?? currentTime)
              }}
            />
          ) : (
            <p className="px-6 text-center text-sm text-white/65">Sin video disponible</p>
          )}
        </div>
        {!playing && !loading && detections.length > 0 && (
          <DetectionOverlay
            detections={detections}
            targets={targets}
            frameIdx={0}
            onToggle={(det) => onToggle(det)}
          />
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
            Detectando este frame…
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/70 p-2">
        <Button type="button" size="icon-sm" variant="outline" onClick={() => seekTo(currentTime - 5, true)}>
          <RotateCcw className="size-4" />
        </Button>
        <Button type="button" size="icon-sm" onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => seekTo(currentTime + 5, true)}>
          <RotateCw className="size-4" />
        </Button>
        <input
          type="range"
          className="mx-2 flex-1 accent-brand"
          min={minTime}
          max={maxTime || 0}
          step={0.1}
          value={currentTime}
          aria-label="Posición del video"
          onChange={(e) => seekTo(Number(e.target.value), false)}
          onMouseUp={() => onFrameSettled(currentTime)}
          onTouchEnd={() => onFrameSettled(currentTime)}
        />
        <span className="w-24 text-right font-mono text-xs text-muted-foreground">
          {formatSegmentTime(currentTime)} / {formatSegmentTime(maxTime || duration)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Reproduce y <strong>pausa</strong> en el frame que quieras; las cajas se recalculan para ese instante.
      </p>
    </div>
  )
}
