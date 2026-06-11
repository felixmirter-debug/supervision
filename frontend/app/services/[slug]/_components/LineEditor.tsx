'use client'

import { Button } from '@/components/ui/button'
import { FlipHorizontal2, RotateCcw } from 'lucide-react'
import type { LineConfig, ProcessingConfig } from '@/lib/processing-config'
import { VideoFrameCanvas, type DragTarget } from './VideoFrameCanvas'

interface Props {
  imageSrc: string
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

function defaultLine(): LineConfig {
  return {
    id: 'line-1',
    label: 'Linea 1',
    start: { x: 0.08, y: 0.5 },
    end: { x: 0.92, y: 0.5 },
    direction: 'in_out',
  }
}

export function LineEditor({ imageSrc, config, onChange }: Props) {
  const line = (config.lines ?? [])[0] ?? defaultLine()
  const normalizedConfig = { ...config, lines: [line] }

  function updateLine(nextLine: LineConfig) {
    onChange({ ...config, lines: [nextLine] })
  }

  function handleMovePoint(target: DragTarget, point: { x: number; y: number }) {
    if (target.kind !== 'line' || target.shapeId !== line.id) return
    updateLine({ ...line, [target.pointKey]: point })
  }

  function resetLine() {
    updateLine(defaultLine())
  }

  function invertDirection() {
    updateLine({
      ...line,
      start: line.end,
      end: line.start,
      direction: line.direction === 'out_in' ? 'in_out' : 'out_in',
    })
  }

  return (
    <div className="space-y-3">
      <VideoFrameCanvas
        imageSrc={imageSrc}
        config={normalizedConfig}
        activeShapeId={line.id}
        onMovePoint={handleMovePoint}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">Linea de conteo</span>
        <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={resetLine}>
          <RotateCcw className="h-4 w-4" />
          Linea media
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={invertDirection}>
          <FlipHorizontal2 className="h-4 w-4" />
          Invertir direccion
        </Button>
        </div>
      </div>
    </div>
  )
}
