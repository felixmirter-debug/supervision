'use client'

import { useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import { getJob } from '@/lib/api'
import type { Job } from '@/lib/api'

const STATUS_LABEL: Partial<Record<Job['status'], string>> = {
  processing: 'Procesando video…',
  confirmed: 'Preparando procesamiento…',
  estimating: 'Estimando costo…',
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
    (j: Job) => {
      if (j.status === 'done') onDone(j)
      if (j.status === 'failed') onFailed(j)
    },
    [onDone, onFailed]
  )

  useEffect(() => {
    if (job && (job.status === 'done' || job.status === 'failed')) {
      handleComplete(job)
    }
  }, [job, handleComplete])

  const label = job ? (STATUS_LABEL[job.status] ?? 'Procesando…') : 'Iniciando…'

  return (
    <div className="py-12 flex flex-col items-center gap-6 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-brand" />
      <div className="space-y-2 w-full max-w-xs">
        <p className="text-sm font-medium">{label}</p>
        <Progress value={null} className="h-1.5" />
      </div>
      <p className="text-xs text-muted-foreground">
        Procesando con YOLOv8 + supervision. Puedes cerrar esta pestaña y volver luego.
      </p>
    </div>
  )
}
