'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Flag, Loader2, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPreviewFrame } from '@/lib/api'
import { formatSegmentRange, formatSegmentTime, type AnalysisSegment } from '@/lib/processing-config'
import { cn } from '@/lib/utils'

type ThumbMap = Record<string, string | null>

interface Props {
  jobId: string
  token: string
  duration: number
  currentTime: number
  segment: AnalysisSegment
  splitPoints: number[]
  onSeek: (time: number) => void
  onSegmentChange: (segment: AnalysisSegment) => void
  onAddSplit: (time: number) => void
}

function frameTimes(duration: number): number[] {
  const count = duration > 900 ? 18 : 14
  if (duration <= 0) return [0]
  const safeEnd = Math.max(0, duration - Math.min(0.5, duration * 0.01))
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1)
    return Number(Math.min(safeEnd, ratio * safeEnd).toFixed(1))
  })
}

function percent(value: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, (value / duration) * 100))
}

export function VideoStoryboardTimeline({
  jobId,
  token,
  duration,
  currentTime,
  segment,
  splitPoints,
  onSeek,
  onSegmentChange,
  onAddSplit,
}: Props) {
  const times = useMemo(() => frameTimes(duration), [duration])
  const [thumbs, setThumbs] = useState<ThumbMap>({})
  const durationMax = Math.max(0.1, duration)

  useEffect(() => {
    const pending = times.filter((time) => !Object.hasOwn(thumbs, `${jobId}:${time}`))
    if (pending.length === 0) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      void Promise.all(
        pending.map((time) =>
          getPreviewFrame(jobId, token, time)
            .then((frame) => [`${jobId}:${time}`, `data:image/jpeg;base64,${frame.image_base64}`] as const)
            .catch(() => [`${jobId}:${time}`, null] as const)
        )
      ).then((frames) => {
        if (cancelled) return
        const next = Object.fromEntries(frames)
        setThumbs((current) => ({ ...current, ...next }))
      })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [duration, jobId, thumbs, times, token])

  function setStartAtCursor() {
    const nextStart = Math.min(currentTime, segment.end_sec - 0.1)
    onSegmentChange({ ...segment, start_sec: Math.max(0, nextStart) })
  }

  function setEndAtCursor() {
    const nextEnd = Math.max(currentTime, segment.start_sec + 0.1)
    onSegmentChange({ ...segment, end_sec: Math.min(durationMax, nextEnd) })
  }

  const startPct = percent(segment.start_sec, durationMax)
  const endPct = percent(segment.end_sec, durationMax)
  const currentPct = percent(currentTime, durationMax)

  return (
    <section className="rounded-lg border border-border bg-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Linea de tiempo</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatSegmentRange(segment)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={setStartAtCursor}>
            <Flag className="size-4" />
            Inicio aqui
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={setEndAtCursor}>
            <Flag className="size-4" />
            Final aqui
          </Button>
          <Button type="button" size="sm" onClick={() => onAddSplit(currentTime)}>
            <Scissors className="size-4" />
            Split aqui
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-1.5">
          {times.map((time) => {
            const key = `${jobId}:${time}`
            const thumb = thumbs[key]
            const inSegment = time >= segment.start_sec && time <= segment.end_sec
            const active = Math.abs(time - currentTime) <= Math.max(1, durationMax / times.length / 2)
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSeek(time)}
                className={cn(
                  'w-28 overflow-hidden rounded-md border bg-background text-left transition',
                  inSegment ? 'border-brand-border ring-2 ring-brand/20' : 'border-border',
                  active && 'border-primary ring-2 ring-primary/35'
                )}
              >
                <div className="aspect-video bg-muted">
                  {thumb ? (
                    <Image src={thumb} alt="" width={112} height={63} unoptimized className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      {Object.hasOwn(thumbs, key) ? '--' : <Loader2 className="size-4 animate-spin" />}
                    </span>
                  )}
                </div>
                <div className="px-2 py-1 font-mono text-xs">{formatSegmentTime(time)}</div>
              </button>
            )
          })}
        </div>
      </div>

      <svg viewBox="0 0 100 14" className="mt-2 h-10 w-full overflow-visible" role="img" aria-label="Rango elegido">
        <rect x="0" y="6" width="100" height="2" rx="1" className="fill-muted" />
        <rect x={startPct} y="4.75" width={Math.max(0.5, endPct - startPct)} height="4.5" rx="2" className="fill-brand" />
        <line x1={currentPct} x2={currentPct} y1="1" y2="13" className="stroke-foreground" strokeWidth="0.8" />
        <line x1={startPct} x2={startPct} y1="2" y2="12" className="stroke-brand" strokeWidth="1.2" />
        <line x1={endPct} x2={endPct} y1="2" y2="12" className="stroke-brand" strokeWidth="1.2" />
        {splitPoints.map((point) => {
          const splitPct = percent(point, durationMax)
          return <line key={point} x1={splitPct} x2={splitPct} y1="0.5" y2="13.5" className="stroke-destructive" />
        })}
      </svg>
    </section>
  )
}
