'use client'

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from 'react'
import type { NormalizedPoint, ProcessingConfig } from '@/lib/processing-config'
import { clampPoint } from '@/lib/processing-config'
import { LineOverlay, PolygonOverlay, polygonAttr, type DragTarget } from './VideoFrameShapes'

type SvgClientEvent = Pick<React.PointerEvent<SVGSVGElement>, 'clientX' | 'clientY'>

interface Props {
  imageSrc: string
  config: ProcessingConfig
  draftPoints?: NormalizedPoint[]
  activeShapeId?: string
  onCanvasPoint?: (point: NormalizedPoint) => void
  onMovePoint?: (target: DragTarget, point: NormalizedPoint) => void
}

export function VideoFrameCanvas({
  imageSrc,
  config,
  draftPoints = [],
  activeShapeId,
  onCanvasPoint,
  onMovePoint,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null)
  const stats = [
    config.zones?.length ? `${config.zones.length} zonas` : null,
    config.lines?.length ? `${config.lines.length} lineas` : null,
    config.rois?.length ? `${config.rois.length} ROI` : null,
  ].filter(Boolean)

  function eventPoint(event: SvgClientEvent): NormalizedPoint {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return clampPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragTarget || !onMovePoint) return
    onMovePoint(dragTarget, eventPoint(event))
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (dragTarget) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      setDragTarget(null)
    }
  }

  function startDrag(event: React.PointerEvent<SVGElement>, target: DragTarget) {
    event.preventDefault()
    event.stopPropagation()
    svgRef.current?.setPointerCapture(event.pointerId)
    setDragTarget(target)
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border/80 bg-black shadow-sm"
      style={{ aspectRatio: `${config.frame_width || 16} / ${config.frame_height || 9}` }}
    >
      <img
        src={imageSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full touch-none"
        onClick={(event) => onCanvasPoint?.(eventPoint(event))}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <pattern id="preview-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeOpacity="0.08" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#preview-grid)" pointerEvents="none" />
        {(config.zones ?? []).map((zone) => (
          <PolygonOverlay key={zone.id} shape={zone} kind="zone" activeShapeId={activeShapeId} onStartDrag={startDrag} />
        ))}
        {(config.rois ?? []).map((roi) => (
          <PolygonOverlay key={roi.id} shape={roi} kind="roi" activeShapeId={activeShapeId} onStartDrag={startDrag} />
        ))}
        {(config.lines ?? []).map((line) => (
          <LineOverlay key={line.id} line={line} activeShapeId={activeShapeId} onStartDrag={startDrag} />
        ))}
        {draftPoints.length > 0 && (
          <polyline
            points={polygonAttr(draftPoints)}
            fill="none"
            stroke="rgb(250 204 21)"
            strokeDasharray="2 2"
            strokeWidth={0.7}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
        {stats.map((item) => (
          <span key={item} className="rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {item}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-2 rounded-md ring-1 ring-white/10" />
    </div>
  )
}

export type { DragTarget }
