'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
      <div className="px-5 py-12 text-center text-muted-foreground">
        <p>Aun no tienes jobs procesados.</p>
        <Link href="/services" className={cn(buttonVariants({ size: 'sm' }), 'mt-4 inline-flex')}>
          Probar un servicio
        </Link>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {jobs.map((job) => {
        const service = getService(job.service)
        return (
          <div key={job.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">{service?.label ?? job.service}</p>
                <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{formatRelativeDate(job.created_at)}</span>
                {job.credits_used != null && <span>{formatCredits(job.credits_used)}</span>}
                {job.processing_config && <span className="truncate">{summarizeProcessingConfig(job.processing_config)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 md:justify-end">
              {job.status === 'done' && job.result_url && (
                <a
                  href={job.result_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
                >
                  Resultado
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
