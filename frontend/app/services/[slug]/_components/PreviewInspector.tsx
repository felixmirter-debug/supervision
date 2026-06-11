'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { PreviewResult } from '@/lib/api'
import type { ProcessingConfig } from '@/lib/processing-config'
import { ConfigTuningFields } from './ConfigTuningFields'
import { PreviewMetricsPanel } from './PreviewMetricsPanel'

interface Props {
  config: ProcessingConfig
  preview: PreviewResult | null
  previewLoading: boolean
  resolution: string
  summary: string
  onChange: (config: ProcessingConfig) => void
  onPreview: () => void
  onReset: () => void
  onCancel: () => void
  onContinue: () => void
}

function countLabel(label: string, count: number): string {
  return `${count} ${label}`
}

export function PreviewInspector({
  config,
  preview,
  previewLoading,
  resolution,
  summary,
  onChange,
  onPreview,
  onReset,
  onCancel,
  onContinue,
}: Props) {
  const zones = config.zones?.length ?? 0
  const lines = config.lines?.length ?? 0
  const rois = config.rois?.length ?? 0

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inspector</p>
          <Badge variant="secondary">{resolution}</Badge>
        </div>
        <p className="mt-2 text-sm font-medium">{summary}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <span className="rounded-md bg-background px-2 py-1">{countLabel('zonas', zones)}</span>
          <span className="rounded-md bg-background px-2 py-1">{countLabel('lineas', lines)}</span>
          <span className="rounded-md bg-background px-2 py-1">{countLabel('ROI', rois)}</span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Ajustes
        </div>
        <ConfigTuningFields config={config} onChange={onChange} />
      </div>

      <PreviewMetricsPanel preview={preview} />

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        <Button type="button" variant="outline" onClick={onPreview} disabled={previewLoading}>
          {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Previsualizar
        </Button>
        <Button type="button" onClick={onContinue} className="col-span-2">
          Continuar
        </Button>
      </div>
    </aside>
  )
}
