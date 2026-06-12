'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportJobClip, getSourcePreview, type EstimateResult } from '@/lib/api'
import type { ServiceConfig } from '@/lib/services'
import type { AnalysisSegment } from '@/lib/processing-config'
import { toast } from 'sonner'
import { VideoReviewHeader } from './VideoReviewHeader'
import { VideoReviewPlayer } from './VideoReviewPlayer'
import { VideoSegmentControls } from './VideoSegmentControls'
import { VideoStoryboardTimeline } from './VideoStoryboardTimeline'

export type VideoReviewSource = {
  inputType: 'upload' | 'url'
  src?: string
  label?: string
}

interface Props {
  service: ServiceConfig
  estimate: EstimateResult
  token: string
  source: VideoReviewSource | null
  initialSegment: AnalysisSegment | null
  onContinue: (segment: AnalysisSegment) => void
  onCancel: () => void
}

function fullSegment(duration: number): AnalysisSegment {
  return { start_sec: 0, end_sec: Math.max(0.1, duration), label: 'Seleccion principal' }
}

function clipName(estimate: EstimateResult, segment: AnalysisSegment): string {
  const start = segment.start_sec.toFixed(1).replace('.', '_')
  const end = segment.end_sec.toFixed(1).replace('.', '_')
  return `${estimate.service}-${start}-${end}.mp4`
}

export function VideoReviewView({ service, estimate, token, source, initialSegment, onContinue, onCancel }: Props) {
  const fetchedUrlRef = useRef<string | null>(null)
  const exportUrlRef = useRef<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(source?.src ?? null)
  const [duration, setDuration] = useState(estimate.duration_sec)
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [segment, setSegment] = useState<AnalysisSegment>(initialSegment ?? fullSegment(estimate.duration_sec))
  const [splitPoints, setSplitPoints] = useState<number[]>([])
  const [loadingSource, setLoadingSource] = useState(!source?.src)
  const [triedFallback, setTriedFallback] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportUrl, setExportUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (fetchedUrlRef.current) URL.revokeObjectURL(fetchedUrlRef.current)
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current)
    }
  }, [])

  const loadPlayableSource = useCallback(async () => {
    setLoadingSource(true)
    try {
      const blob = await getSourcePreview(estimate.job_id, token)
      if (fetchedUrlRef.current) URL.revokeObjectURL(fetchedUrlRef.current)
      const nextUrl = URL.createObjectURL(blob)
      fetchedUrlRef.current = nextUrl
      setVideoUrl(nextUrl)
      setTriedFallback(true)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar el video')
    } finally {
      setLoadingSource(false)
    }
  }, [estimate.job_id, token])

  useEffect(() => {
    if (source?.src) return
    const timeout = window.setTimeout(() => {
      void loadPlayableSource()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadPlayableSource, source?.src])

  function handlePlaybackError() {
    if (triedFallback) return
    void loadPlayableSource()
  }

  function handleDurationChange(nextDuration: number) {
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) return
    setDuration(nextDuration)
    setSegment((current) => {
      if (current.end_sec > nextDuration) return { ...current, end_sec: nextDuration }
      return current
    })
  }

  function seekTo(time: number) {
    setCurrentTime(time)
    setSeekRequest((current) => ({ id: (current?.id ?? 0) + 1, time }))
  }

  function addSplit(time: number) {
    if (time <= segment.start_sec || time >= segment.end_sec) return
    setSplitPoints((points) => {
      const rounded = Number(time.toFixed(1))
      if (points.some((point) => Math.abs(point - rounded) < 0.1)) return points
      return [...points, rounded].sort((a, b) => a - b)
    })
  }

  function removeSplit(time: number) {
    setSplitPoints((points) => points.filter((point) => point !== time))
  }

  async function exportSegment() {
    setExporting(true)
    try {
      const blob = await exportJobClip(estimate.job_id, segment, token)
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current)
      const nextUrl = URL.createObjectURL(blob)
      exportUrlRef.current = nextUrl
      setExportUrl(nextUrl)
      toast.success('Segmento exportado')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo exportar el segmento')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <VideoReviewHeader service={service} source={source} segment={segment} />

      {!videoUrl && !loadingSource && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          El video necesita una version reproducible para el navegador.
          <Button type="button" size="sm" className="ml-3" onClick={loadPlayableSource}>
            Preparar preview
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <VideoReviewPlayer
          videoUrl={videoUrl}
          duration={duration}
          currentTime={currentTime}
          playing={playing}
          zoom={zoom}
          loading={loadingSource}
          seekRequest={seekRequest}
          onTimeChange={setCurrentTime}
          onDurationChange={handleDurationChange}
          onPlayingChange={setPlaying}
          onZoomChange={setZoom}
          onPlaybackError={handlePlaybackError}
        />
        <VideoStoryboardTimeline
          jobId={estimate.job_id}
          token={token}
          duration={duration}
          currentTime={currentTime}
          segment={segment}
          splitPoints={splitPoints}
          onSeek={seekTo}
          onSegmentChange={setSegment}
          onAddSplit={addSplit}
        />
        <VideoSegmentControls
          duration={duration}
          currentTime={currentTime}
          segment={segment}
          splitPoints={splitPoints}
          creditsPerSec={estimate.credits_per_sec}
          exportUrl={exportUrl}
          exportName={clipName(estimate, segment)}
          exporting={exporting}
          onRemoveSplit={removeSplit}
          onUsePart={(part) => setSegment({ ...part, label: 'Seleccion principal' })}
          onResetFull={() => setSegment(fullSegment(duration))}
          onExport={exportSegment}
          onContinue={() => onContinue(segment)}
        />
      </div>
      <div className="flex justify-start">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cambiar entrada
        </Button>
      </div>
    </div>
  )
}
