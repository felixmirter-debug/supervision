'use client'

import { Button } from '@/components/ui/button'
import { Maximize2, Plus, Trash2 } from 'lucide-react'
import type { NormalizedPoint, ProcessingConfig, ZoneConfig } from '@/lib/processing-config'
import { VideoFrameCanvas, type DragTarget } from './VideoFrameCanvas'

interface Props {
  imageSrc: string
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

function nextZone(existing: ZoneConfig[]): ZoneConfig {
  return {
    id: `zone-${existing.length + 1}-${Date.now()}`,
    label: `Zona ${existing.length + 1}`,
    points: [],
  }
}

export function ZoneEditor({ imageSrc, config, onChange }: Props) {
  const zones = config.zones ?? []
  const activeZone = zones[zones.length - 1] ?? null

  function updateZones(nextZones: ZoneConfig[]) {
    onChange({ ...config, zones: nextZones })
  }

  function handleCanvasPoint(point: NormalizedPoint) {
    if (!activeZone) {
      updateZones([{ ...nextZone([]), points: [point] }])
      return
    }
    updateZones(zones.map((zone) => (
      zone.id === activeZone.id ? { ...zone, points: [...zone.points, point] } : zone
    )))
  }

  function handleMovePoint(target: DragTarget, point: NormalizedPoint) {
    if (target.kind !== 'zone') return
    updateZones(zones.map((zone) => {
      if (zone.id !== target.shapeId) return zone
      return {
        ...zone,
        points: zone.points.map((current, index) => (
          index === target.pointIndex ? point : current
        )),
      }
    }))
  }

  function addZone() {
    updateZones([...zones, nextZone(zones)])
  }

  function resetFullFrame() {
    updateZones([{
      id: 'zone-full-frame',
      label: 'Zona completa',
      points: [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ],
    }])
  }

  function deleteLastZone() {
    updateZones(zones.slice(0, -1))
  }

  return (
    <div className="space-y-3">
      <VideoFrameCanvas
        imageSrc={imageSrc}
        config={config}
        activeShapeId={activeZone?.id}
        draftPoints={activeZone && activeZone.points.length < 3 ? activeZone.points : []}
        onCanvasPoint={handleCanvasPoint}
        onMovePoint={handleMovePoint}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {zones.length} zona{zones.length === 1 ? '' : 's'}
        </span>
        <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addZone}>
          <Plus className="h-4 w-4" />
          Nueva zona
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={resetFullFrame}>
          <Maximize2 className="h-4 w-4" />
          Zona completa
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={deleteLastZone} disabled={zones.length === 0}>
          <Trash2 className="h-4 w-4" />
          Borrar ultima
        </Button>
        </div>
      </div>
    </div>
  )
}
