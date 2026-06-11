'use client'

import { Badge } from '@/components/ui/badge'
import type { PreviewResult } from '@/lib/api'

interface Props {
  preview: PreviewResult | null
}

function compactValue(value: unknown): string {
  if (value == null) return '0'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function metricRows(preview: PreviewResult | null) {
  if (!preview) return []
  return Object.entries(preview.metrics)
    .filter(([key]) => key !== 'config')
    .slice(0, 7)
}

export function PreviewMetricsPanel({ preview }: Props) {
  const rows = metricRows(preview)

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metricas</p>
        {preview && <Badge variant="secondary">{preview.sampled_frames} frames</Badge>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin muestra generada</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground">{key.replace(/_/g, ' ')}</span>
              <span className="max-w-32 truncate rounded-md bg-background px-2 py-1 font-mono text-foreground">
                {compactValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
