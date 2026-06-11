'use client'

import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatCredits, formatRelativeDate } from '@/lib/formatters'
import { getService } from '@/lib/services'
import { summarizeProcessingConfig } from '@/lib/processing-config'
import type { Job } from '@/lib/api'

const STATUS_VARIANT: Record<Job['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  done: 'default',
  processing: 'secondary',
  failed: 'destructive',
  refunded: 'outline',
  pending: 'outline',
  estimating: 'outline',
  confirmed: 'secondary',
}

const STATUS_LABEL: Record<Job['status'], string> = {
  done: 'Listo',
  processing: 'Procesando',
  failed: 'Fallido',
  refunded: 'Reembolsado',
  pending: 'Pendiente',
  estimating: 'Estimando',
  confirmed: 'Confirmado',
}

export function JobHistoryTable({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Aún no tienes jobs procesados.</p>
        <Link
          href="/services"
          className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'mt-4 inline-flex')}
        >
          Probar un servicio
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const svc = getService(job.service)
        return (
          <div
            key={job.id}
            className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3 gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{svc?.label ?? job.service}</p>
              <p className="text-xs text-muted-foreground">{formatRelativeDate(job.created_at)}</p>
              {job.processing_config && (
                <p className="text-xs text-muted-foreground truncate">
                  {summarizeProcessingConfig(job.processing_config)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {job.credits_used != null && (
                <span className="text-xs font-mono text-muted-foreground">
                  {formatCredits(job.credits_used)}
                </span>
              )}
              <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
              {job.status === 'done' && job.result_url && (
                <a
                  href={job.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  Ver resultado
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
