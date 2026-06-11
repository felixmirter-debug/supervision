'use client'

import type { LineConfig, NormalizedPoint, RoiConfig, ZoneConfig } from '@/lib/processing-config'

export type DragTarget =
  | { kind: 'zone'; shapeId: string; pointIndex: number }
  | { kind: 'roi'; shapeId: string; pointIndex: number }
  | { kind: 'line'; shapeId: string; pointKey: 'start' | 'end' }

export function polygonAttr(points: NormalizedPoint[]): string {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')
}

interface PolygonProps {
  shape: ZoneConfig | RoiConfig
  kind: 'zone' | 'roi'
  activeShapeId?: string
  onStartDrag: (event: React.PointerEvent<SVGElement>, target: DragTarget) => void
}

export function PolygonOverlay({ shape, kind, activeShapeId, onStartDrag }: PolygonProps) {
  const isActive = activeShapeId === shape.id
  const points = shape.points
  const stroke = kind === 'zone' ? 'rgb(167 139 250)' : 'rgb(45 212 191)'

  return (
    <g>
      {points.length >= 2 && (
        <polygon
          points={polygonAttr(points)}
          fill={kind === 'zone' ? 'rgb(124 58 237 / 0.18)' : 'rgb(13 148 136 / 0.16)'}
          stroke={stroke}
          strokeWidth={isActive ? 0.9 : 0.65}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {points.map((point, index) => (
        <circle
          key={`${shape.id}-${index}`}
          cx={point.x * 100}
          cy={point.y * 100}
          r={isActive ? 1.35 : 1.05}
          fill="rgb(250 250 250)"
          stroke={stroke}
          strokeWidth={0.55}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => onStartDrag(event, { kind, shapeId: shape.id, pointIndex: index })}
        />
      ))}
      {points[0] && (
        <text
          x={points[0].x * 100}
          y={(points[0].y * 100) - 1.6}
          fill={stroke}
          fontSize="2.2"
          fontWeight="700"
          pointerEvents="none"
        >
          {shape.label}
        </text>
      )}
    </g>
  )
}

interface LineProps {
  line: LineConfig
  activeShapeId?: string
  onStartDrag: (event: React.PointerEvent<SVGElement>, target: DragTarget) => void
}

export function LineOverlay({ line, activeShapeId, onStartDrag }: LineProps) {
  const isActive = activeShapeId === line.id
  const stroke = 'rgb(74 222 128)'

  return (
    <g>
      <defs>
        <marker id={`arrow-${line.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 z" fill={stroke} />
        </marker>
      </defs>
      <line
        x1={line.start.x * 100}
        y1={line.start.y * 100}
        x2={line.end.x * 100}
        y2={line.end.y * 100}
        stroke={stroke}
        strokeWidth={isActive ? 1.1 : 0.8}
        markerEnd={`url(#arrow-${line.id})`}
        vectorEffect="non-scaling-stroke"
      />
      {(['start', 'end'] as const).map((pointKey) => {
        const point = line[pointKey]
        return (
          <circle
            key={pointKey}
            cx={point.x * 100}
            cy={point.y * 100}
            r={isActive ? 1.4 : 1.1}
            fill="rgb(250 250 250)"
            stroke={stroke}
            strokeWidth={0.55}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(event) => onStartDrag(event, { kind: 'line', shapeId: line.id, pointKey })}
          />
        )
      })}
    </g>
  )
}
