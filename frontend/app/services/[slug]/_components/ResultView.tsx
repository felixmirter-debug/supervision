'use client'

import Link from 'next/link'
import { CheckCircle, Download, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCredits, formatDuration } from '@/lib/formatters'
import type { Job } from '@/lib/api'
import { summarizeProcessingConfig } from '@/lib/processing-config'
import { TargetMetricsCard, type TargetMetric } from './TargetMetricsCard'
import {
  CountingResultPanel,
  type CountingLineMetric,
  type CountingZoneMetric,
} from './CountingResultPanel'

interface Props {
  job: Job
  onReset: () => void
}

function extractTargetMetrics(metrics: Record<string, unknown> | null): TargetMetric[] {
  const raw = metrics?.targets
  return Array.isArray(raw) ? (raw as TargetMetric[]) : []
}

export function ResultView({ job, onReset }: Props) {
  const targetMetrics = extractTargetMetrics(job.metrics)
  const countingLines = Array.isArray(job.metrics?.lines)
    ? (job.metrics?.lines as CountingLineMetric[])
    : []
  const countingZones = Array.isArray(job.metrics?.zones)
    ? (job.metrics?.zones as CountingZoneMetric[])
    : []
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-green-500 dark:text-green-400">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">Procesamiento completado</span>
        </div>

        {job.result_url && (
          <div className="overflow-hidden rounded-lg border border-border bg-black">
            <video controls playsInline preload="metadata" className="w-full">
              <source src={job.result_url} type="video/mp4" />
            </video>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Uso</p>
          <div className="mt-3 space-y-2 text-sm">
            {job.duration_sec != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duracion</span>
                <span className="font-mono">{formatDuration(job.duration_sec)}</span>
              </div>
            )}
            {job.credits_used != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creditos</span>
                <span className="font-mono">{formatCredits(job.credits_used)}</span>
              </div>
            )}
          </div>
        </div>
        {job.processing_config && (
          <div className="rounded-lg border border-border bg-card/60 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Configuracion</p>
            <p className="mt-2 font-medium">{summarizeProcessingConfig(job.processing_config)}</p>
          </div>
        )}
        {targetMetrics.length > 0 && <TargetMetricsCard targets={targetMetrics} />}
        {(countingLines.length > 0 || countingZones.length > 0) && (
          <CountingResultPanel lines={countingLines} zones={countingZones} />
        )}
        {job.metrics && (
          <div className="rounded-lg border border-border bg-card/60 p-4">
            <p className="text-sm font-semibold">Metricas</p>
            <div className="mt-3 space-y-2">
              {Object.entries(job.metrics)
                .filter(([key]) => key !== 'targets' && key !== 'lines' && key !== 'zones')
                .map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                  <Badge variant="secondary" className="max-w-36 truncate font-mono text-xs">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        {job.result_url && (
          <a href={job.result_url} download className={cn(buttonVariants(), 'w-full gap-1.5')}>
            <Download className="h-4 w-4" />
            Descargar
          </a>
        )}
        <button onClick={onReset} className={cn(buttonVariants({ variant: 'outline' }), 'w-full gap-1.5')}>
          <RotateCcw className="h-4 w-4" />
          Procesar otro
        </button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}>
          Ver historial
        </Link>
      </aside>
    </div>
  )
}
