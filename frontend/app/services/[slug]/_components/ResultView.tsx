'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { CheckCircle, Download } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatCredits, formatDuration } from '@/lib/formatters'
import type { Job } from '@/lib/api'
import { summarizeProcessingConfig } from '@/lib/processing-config'

interface Props {
  job: Job
  onReset: () => void
}

export function ResultView({ job, onReset }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-green-400">
        <CheckCircle className="h-5 w-5" />
        <span className="font-semibold">Procesamiento completado</span>
      </div>

      {job.result_url && (
        <div className="rounded-xl overflow-hidden border border-border">
          <video
            controls
            playsInline
            preload="metadata"
            className="w-full"
          >
            <source src={job.result_url} type="video/mp4" />
          </video>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {job.duration_sec != null && (
          <Card className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Duración</p>
            <p className="font-mono font-medium">{formatDuration(job.duration_sec)}</p>
          </Card>
        )}
        {job.credits_used != null && (
          <Card className="p-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Créditos usados</p>
            <p className="font-mono font-medium">{formatCredits(job.credits_used)}</p>
          </Card>
        )}
      </div>

      {job.processing_config && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="text-xs text-muted-foreground">Configuracion</p>
          <p className="mt-1 font-medium">{summarizeProcessingConfig(job.processing_config)}</p>
        </div>
      )}

      {job.metrics && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold">Métricas</p>
          <div className="space-y-1">
            {Object.entries(job.metrics).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        {job.result_url && (
          <a
            href={job.result_url}
            download
            className={cn(buttonVariants({ variant: 'default' }), 'gap-1.5')}
          >
            <Download className="h-4 w-4" />
            Descargar
          </a>
        )}
        <button
          onClick={onReset}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Procesar otro
        </button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }))}>
          Ver historial
        </Link>
      </div>
    </div>
  )
}
