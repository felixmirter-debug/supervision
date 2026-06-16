'use client'

import type { DetectionPreviewEntry } from '@/lib/api'
import type { TrackingTarget } from '@/lib/processing-config'

interface Props {
  detections: DetectionPreviewEntry[]
  targets: TrackingTarget[]
  frameIdx: number
  onToggle: (detection: DetectionPreviewEntry, frameIdx: number) => void
}

function isSelected(det: DetectionPreviewEntry, targets: TrackingTarget[]): boolean {
  return targets.some(
    (t) =>
      Math.abs(t.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(t.bbox.y1 - det.bbox.y1) < 0.02
  )
}

export function DetectionOverlay({ detections, targets, frameIdx, onToggle }: Props) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      role="listbox"
      aria-label="Objetos detectados"
    >
      {detections.map((det, i) => {
        const selected = isSelected(det, targets)
        const stroke = selected ? '#00ffcc' : 'rgba(255,255,255,0.6)'
        return (
          <rect
            key={`${frameIdx}-${i}`}
            x={det.bbox.x1}
            y={det.bbox.y1}
            width={det.bbox.x2 - det.bbox.x1}
            height={det.bbox.y2 - det.bbox.y1}
            fill={selected ? 'rgba(0,255,204,0.15)' : 'transparent'}
            stroke={stroke}
            strokeWidth={selected ? 0.006 : 0.003}
            strokeDasharray={selected ? undefined : '0.01 0.006'}
            className="cursor-pointer"
            role="option"
            aria-selected={selected}
            onClick={() => onToggle(det, frameIdx)}
          />
        )
      })}
    </svg>
  )
}
