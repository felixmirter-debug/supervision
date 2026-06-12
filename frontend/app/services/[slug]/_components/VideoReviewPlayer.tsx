'use client'

import { useEffect, useRef } from 'react'
import { Maximize2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSegmentTime } from '@/lib/processing-config'
import { cn } from '@/lib/utils'

const ZOOM_CLASS: Record<number, string> = {
  1: 'scale-100',
  1.25: 'scale-125',
  1.5: 'scale-150',
  2: 'scale-[2]',
  3: 'scale-[3]',
}

interface Props {
  videoUrl: string | null
  duration: number
  currentTime: number
  playing: boolean
  zoom: number
  loading: boolean
  onTimeChange: (time: number) => void
  onDurationChange: (duration: number) => void
  onPlayingChange: (playing: boolean) => void
  onZoomChange: (zoom: number) => void
  onPlaybackError: () => void
  seekRequest: { id: number; time: number } | null
}

export function VideoReviewPlayer({
  videoUrl,
  duration,
  currentTime,
  playing,
  zoom,
  loading,
  onTimeChange,
  onDurationChange,
  onPlayingChange,
  onZoomChange,
  onPlaybackError,
  seekRequest,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !seekRequest) return
    video.currentTime = Math.max(0, Math.min(duration, seekRequest.time))
  }, [duration, seekRequest])

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      return
    }
    video.pause()
  }

  function seekTo(time: number) {
    const video = videoRef.current
    if (!video) return
    const nextTime = Math.max(0, Math.min(duration, time))
    video.currentTime = nextTime
    onTimeChange(nextTime)
  }

  const zoomOptions = [1, 1.25, 1.5, 2, 3]
  return (
    <div className="space-y-3">
      <div className="relative overflow-auto rounded-lg border border-border bg-black">
        <div className="flex aspect-video min-h-[260px] max-h-[72vh] items-center justify-center lg:min-h-[420px]">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              className={cn(
                'h-full w-full origin-center object-contain transition-transform duration-200',
                ZOOM_CLASS[zoom]
              )}
              controls
              playsInline
              preload="metadata"
              onDurationChange={(event) => onDurationChange(event.currentTarget.duration || duration)}
              onLoadedMetadata={(event) => onDurationChange(event.currentTarget.duration || duration)}
              onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
              onPlay={() => onPlayingChange(true)}
              onPause={() => onPlayingChange(false)}
              onError={onPlaybackError}
            />
          ) : (
            <div className="px-6 text-center text-sm text-white/65">
              {loading ? 'Preparando video reproducible...' : 'Sin fuente de video disponible'}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/70 p-2">
        <Button type="button" size="icon-sm" variant="outline" onClick={() => seekTo(currentTime - 5)}>
          <RotateCcw className="size-4" />
        </Button>
        <Button type="button" size="icon-sm" onClick={togglePlayback}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => seekTo(currentTime + 5)}>
          <RotateCw className="size-4" />
        </Button>
        <span className="ml-auto w-24 text-right font-mono text-xs text-muted-foreground">
          {formatSegmentTime(currentTime)} / {formatSegmentTime(duration)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <Maximize2 className="size-3.5" />
          Zoom
        </span>
        {zoomOptions.map((option) => (
          <Button
            key={option}
            type="button"
            size="xs"
            variant={zoom === option ? 'default' : 'outline'}
            onClick={() => onZoomChange(option)}
          >
            {option}x
          </Button>
        ))}
      </div>
    </div>
  )
}
