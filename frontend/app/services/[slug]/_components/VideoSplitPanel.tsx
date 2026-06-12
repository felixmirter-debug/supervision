import { Button } from '@/components/ui/button'
import { formatSegmentTime, type AnalysisSegment } from '@/lib/processing-config'

interface SegmentPart {
  index: number
  start_sec: number
  end_sec: number
}

interface Props {
  currentTime: number
  segment: AnalysisSegment
  splitPoints: number[]
  onRemoveSplit: (time: number) => void
  onUsePart: (part: AnalysisSegment) => void
}

function partsFromSegment(segment: AnalysisSegment, splitPoints: number[]): SegmentPart[] {
  const points = splitPoints
    .filter((point) => point > segment.start_sec && point < segment.end_sec)
    .sort((a, b) => a - b)
  const boundaries = [segment.start_sec, ...points, segment.end_sec]
  return boundaries.slice(0, -1).map((start, index) => ({
    index,
    start_sec: start,
    end_sec: boundaries[index + 1],
  }))
}

export function VideoSplitPanel({
  segment,
  splitPoints,
  onRemoveSplit,
  onUsePart,
}: Props) {
  const parts = partsFromSegment(segment, splitPoints)

  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-sm font-medium">Partes</p>
        {splitPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin splits. Usa Split aqui en la linea de tiempo.</p>
        ) : (
          splitPoints.map((point) => (
            <div key={point} className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1 text-sm">
              <span className="font-mono">{formatSegmentTime(point)}</span>
              <Button type="button" size="xs" variant="ghost" onClick={() => onRemoveSplit(point)}>
                Quitar
              </Button>
            </div>
          ))
        )}
      </div>
      {parts.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {parts.map((part) => (
            <button
              key={`${part.start_sec}-${part.end_sec}`}
              type="button"
              onClick={() => onUsePart(part)}
              className="rounded-md border border-border px-3 py-2 text-left text-sm hover:border-brand-border hover:bg-brand-soft"
            >
              <span className="mr-2">Parte {part.index + 1}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatSegmentTime(part.start_sec)}-{formatSegmentTime(part.end_sec)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
