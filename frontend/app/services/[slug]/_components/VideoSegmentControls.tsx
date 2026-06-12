'use client'

import { Download, Flag, SkipForward } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCredits, formatDuration } from '@/lib/formatters'
import {
  formatSegmentRange,
  formatSegmentTime,
  segmentDuration,
  type AnalysisSegment,
} from '@/lib/processing-config'
import { VideoSplitPanel } from './VideoSplitPanel'

interface Props {
  duration: number
  currentTime: number
  segment: AnalysisSegment
  splitPoints: number[]
  creditsPerSec: number
  exportUrl: string | null
  exportName: string
  exporting: boolean
  onRemoveSplit: (time: number) => void
  onUsePart: (part: AnalysisSegment) => void
  onResetFull: () => void
  onExport: () => void
  onContinue: () => void
}

export function VideoSegmentControls({
  duration,
  currentTime,
  segment,
  splitPoints,
  creditsPerSec,
  exportUrl,
  exportName,
  exporting,
  onRemoveSplit,
  onUsePart,
  onResetFull,
  onExport,
  onContinue,
}: Props) {
  const selectedDuration = segmentDuration(segment)
  const selectedCredits = Math.ceil(selectedDuration * creditsPerSec)

  return (
    <section className="rounded-lg border border-border bg-card/80 p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="grid gap-3 md:grid-cols-[minmax(13rem,0.8fr)_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Segmento</p>
            <p className="mt-1 text-sm font-medium">{formatSegmentRange(segment)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary">{formatDuration(selectedDuration)}</Badge>
              <Badge variant="outline">{formatCredits(selectedCredits)}</Badge>
              <Badge variant="outline">Cursor {formatSegmentTime(currentTime)}</Badge>
            </div>
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/35 p-3 text-sm text-muted-foreground">
            Marca inicio, final o split desde la linea de tiempo bajo el video.
            <p className="mt-1 text-xs">Duracion total: {formatDuration(duration)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2 xl:justify-end">
          <Button type="button" variant="outline" onClick={onResetFull}>
            <SkipForward className="size-4" />
            Todo
          </Button>
          <Button type="button" variant="outline" onClick={onExport} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? 'Exportando...' : 'Exportar'}
          </Button>
          {exportUrl && (
            <a
              href={exportUrl}
              download={exportName}
              className="flex h-9 items-center justify-center rounded-md border border-brand-border bg-brand-soft px-3 text-sm font-medium text-brand"
            >
              Descargar MP4
            </a>
          )}
          <Button type="button" onClick={onContinue}>
            <Flag className="size-4" />
            Analizar segmento
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <VideoSplitPanel
          currentTime={currentTime}
          segment={segment}
          splitPoints={splitPoints}
          onRemoveSplit={onRemoveSplit}
          onUsePart={onUsePart}
        />
      </div>
    </section>
  )
}
