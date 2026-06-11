'use client'

import { Button } from '@/components/ui/button'
import { Maximize2, Plus, Trash2 } from 'lucide-react'
import type { NormalizedPoint, ProcessingConfig, RoiConfig } from '@/lib/processing-config'
import { VideoFrameCanvas, type DragTarget } from './VideoFrameCanvas'

interface Props {
  imageSrc: string
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

function nextRoi(existing: RoiConfig[]): RoiConfig {
  return {
    id: `roi-${existing.length + 1}-${Date.now()}`,
    label: `ROI ${existing.length + 1}`,
    points: [],
  }
}

export function RoiEditor({ imageSrc, config, onChange }: Props) {
  const rois = config.rois ?? []
  const activeRoi = rois[rois.length - 1] ?? null

  function updateRois(nextRois: RoiConfig[]) {
    onChange({ ...config, rois: nextRois })
  }

  function handleCanvasPoint(point: NormalizedPoint) {
    if (!activeRoi) {
      updateRois([{ ...nextRoi([]), points: [point] }])
      return
    }
    updateRois(rois.map((roi) => (
      roi.id === activeRoi.id ? { ...roi, points: [...roi.points, point] } : roi
    )))
  }

  function handleMovePoint(target: DragTarget, point: NormalizedPoint) {
    if (target.kind !== 'roi') return
    updateRois(rois.map((roi) => {
      if (roi.id !== target.shapeId) return roi
      return {
        ...roi,
        points: roi.points.map((current, index) => (
          index === target.pointIndex ? point : current
        )),
      }
    }))
  }

  function addRoi() {
    updateRois([...rois, nextRoi(rois)])
  }

  function resetFullFrame() {
    updateRois([{
      id: 'roi-full-frame',
      label: 'ROI completo',
      points: [
        { x: 0.05, y: 0.05 },
        { x: 0.95, y: 0.05 },
        { x: 0.95, y: 0.95 },
        { x: 0.05, y: 0.95 },
      ],
    }])
  }

  function deleteLastRoi() {
    updateRois(rois.slice(0, -1))
  }

  return (
    <div className="space-y-3">
      <VideoFrameCanvas
        imageSrc={imageSrc}
        config={config}
        activeShapeId={activeRoi?.id}
        draftPoints={activeRoi && activeRoi.points.length < 3 ? activeRoi.points : []}
        onCanvasPoint={handleCanvasPoint}
        onMovePoint={handleMovePoint}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2">
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {rois.length} ROI
        </span>
        <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addRoi}>
          <Plus className="h-4 w-4" />
          Nuevo ROI
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={resetFullFrame}>
          <Maximize2 className="h-4 w-4" />
          ROI completo
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={deleteLastRoi} disabled={rois.length === 0}>
          <Trash2 className="h-4 w-4" />
          Borrar ultimo
        </Button>
        </div>
      </div>
    </div>
  )
}
