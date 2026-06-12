'use client'

import { useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { getJob } from '@/lib/api'
import type { Job } from '@/lib/api'

const STATUS_LABEL: Partial<Record<Job['status'], string>> = {
  processing: 'Procesando video...',
  confirmed: 'Preparando procesamiento...',
  estimating: 'Estimando costo...',
}

interface Props {
  jobId: string
  token: string
  onDone: (job: Job) => void
  onFailed: (job: Job) => void
}

export function ProcessingView({ jobId, token, onDone, onFailed }: Props) {
  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId, token),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'done' || status === 'failed') return false
      return 2000
    },
  })

  const handleComplete = useCallback(
    (nextJob: Job) => {
      if (nextJob.status === 'done') onDone(nextJob)
      if (nextJob.status === 'failed') onFailed(nextJob)
    },
    [onDone, onFailed]
  )

  useEffect(() => {
    if (job && (job.status === 'done' || job.status === 'failed')) {
      handleComplete(job)
    }
  }, [job, handleComplete])

  const label = job ? (STATUS_LABEL[job.status] ?? 'Procesando...') : 'Iniciando...'

  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center gap-7 text-center">
      <div className="vision-grid flex size-28 items-center justify-center rounded-lg border border-brand-border bg-brand-soft">
        <Loader2 className="h-12 w-12 animate-spin text-brand" />
      </div>
      <div className="w-full max-w-md space-y-3">
        <p className="text-2xl font-semibold">{label}</p>
        <Progress value={null} className="h-2" />
      </div>
      <p className="max-w-md text-sm leading-6 text-muted-foreground">
        Procesando con YOLOv8 + supervision. Puedes cerrar esta pestana y volver luego desde el dashboard.
      </p>
    </div>
  )
}
