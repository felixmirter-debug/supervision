'use client'

import { Button } from '@/components/ui/button'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { LineConfig, ProcessingConfig } from '@/lib/processing-config'
import { VideoFrameCanvas, type DragTarget } from './VideoFrameCanvas'

interface Props {
  imageSrc: string
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

function newLine(n: number): LineConfig {
  return {
    id: `line-${n + 1}-${Date.now()}`,
    label: `Línea ${n + 1}`,
    start: { x: 0.08, y: 0.5 },
    end: { x: 0.92, y: 0.5 },
    direction: 'in_out',
    in_label: 'Entran',
    out_label: 'Salen',
  }
}

export function CountingLineEditor({ imageSrc, config, onChange }: Props) {
  const lines = config.lines ?? []
  const activeLine = lines[lines.length - 1] ?? null

  function updateLines(next: LineConfig[]) {
    onChange({ ...config, lines: next })
  }

  function patchLine(id: string, patch: Partial<LineConfig>) {
    updateLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleMovePoint(target: DragTarget, point: { x: number; y: number }) {
    if (target.kind !== 'line') return
    patchLine(target.shapeId, { [target.pointKey]: point } as Partial<LineConfig>)
  }

  function addLine() {
    updateLines([...lines, newLine(lines.length)])
  }

  function deleteLast() {
    updateLines(lines.slice(0, -1))
  }

  return (
    <div className="space-y-3">
      <VideoFrameCanvas
        imageSrc={imageSrc}
        config={config}
        activeShapeId={activeLine?.id}
        onMovePoint={handleMovePoint}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {lines.length} línea{lines.length === 1 ? '' : 's'}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addLine}>
            <Plus className="h-4 w-4" /> Nueva línea
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={deleteLast} disabled={lines.length === 0}>
            <Trash2 className="h-4 w-4" /> Borrar última
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="rounded-lg border border-border/70 p-2">
            <input
              value={line.label}
              onChange={(e) => patchLine(line.id, { label: e.target.value })}
              className="w-full rounded border bg-background px-2 py-1 text-sm"
              aria-label="Nombre de la línea"
            />
            <div className="mt-2 flex gap-2">
              <input
                value={line.in_label ?? 'Entran'}
                onChange={(e) => patchLine(line.id, { in_label: e.target.value })}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                aria-label="Etiqueta dirección entra"
              />
              <input
                value={line.out_label ?? 'Salen'}
                onChange={(e) => patchLine(line.id, { out_label: e.target.value })}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                aria-label="Etiqueta dirección sale"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  patchLine(line.id, {
                    start: line.end,
                    end: line.start,
                    direction: line.direction === 'out_in' ? 'in_out' : 'out_in',
                  })
                }
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
