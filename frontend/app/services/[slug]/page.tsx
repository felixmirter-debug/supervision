'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Nav } from '@/components/nav'
import { Card } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { estimateService, getJob, processService } from '@/lib/api'
import { getService } from '@/lib/services'
import { toast } from 'sonner'
import type { EstimateResult, Job } from '@/lib/api'
import type { ProcessingConfig } from '@/lib/processing-config'
import { ConfirmModal } from './_components/ConfirmModal'
import { ServiceStagePanel, type ServiceStage } from './_components/ServiceStagePanel'
import type { InputType } from './_components/InputSelector'

export default function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, profile } = useAuthStore()

  const [stage, setStage] = useState<ServiceStage>('idle')
  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [resultJob, setResultJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig | null>(null)

  const service = getService(slug)
  const updateUrl = useCallback((nextStage: ServiceStage, id?: string | null) => {
    const query = id ? `?job=${id}&stage=${nextStage}` : ''
    router.replace(`/services/${slug}${query}`, { scroll: false })
  }, [router, slug])

  useEffect(() => {
    const queryJobId = searchParams.get('job')
    const queryStage = searchParams.get('stage')
    if (!queryJobId || estimate || jobId || resultJob || !session || !service) return

    getJob(queryJobId, session.access_token)
      .then((job) => {
        if (job.status === 'done') {
          setResultJob(job)
          setProcessingConfig(job.processing_config)
          setStage('done')
          return
        }
        if (job.status === 'failed') {
          setErrorMsg(job.error_message ?? 'Error desconocido')
          setStage('failed')
          return
        }
        if (job.status === 'processing' || queryStage === 'processing') {
          setJobId(job.id)
          setStage('processing')
          return
        }
        setEstimate({
          job_id: job.id,
          duration_sec: job.duration_sec ?? 0,
          credits_estimated: job.credits_estimated ?? 0,
          credits_per_sec: service.creditsPerSec,
          service: job.service,
        })
        setJobId(job.id)
        setProcessingConfig(job.processing_config)
        setStage('configuring')
      })
      .catch(() => updateUrl('idle'))
  }, [estimate, jobId, resultJob, searchParams, service, session, updateUrl])
  if (!service) {
    router.replace('/services')
    return null
  }

  if (!session || !profile) {
    router.replace('/login')
    return null
  }

  const token = session.access_token

  async function handleInput(type: InputType, file?: File, url?: string) {
    setStage('estimating')
    try {
      const fd = new FormData()
      fd.append('input_type', type)
      if (type === 'upload' && file) fd.append('file', file)
      if (type === 'url' && url) fd.append('input_url', url)

      const est = await estimateService(slug, fd, token)
      setEstimate(est)
      setJobId(est.job_id)
      setStage('configuring')
      updateUrl('configuring', est.job_id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al estimar'
      toast.error(msg)
      setStage('idle')
    }
  }

  async function handleConfirm() {
    if (!estimate) return
    setConfirmLoading(true)
    try {
      const res = await processService(
        slug,
        { job_id: estimate.job_id, confirmed: true, processing_config: processingConfig ?? undefined },
        token
      )
      setJobId(res.job_id)
      setStage('processing')
      updateUrl('processing', res.job_id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al iniciar procesamiento')
      setStage('idle')
    } finally {
      setConfirmLoading(false)
    }
  }

  function handleDone(job: Job) {
    setResultJob(job)
    setProcessingConfig(job.processing_config)
    setStage('done')
    updateUrl('done', job.id)
    toast.success('Procesamiento completado')
  }

  function handleFailed(job: Job) {
    setErrorMsg(job.error_message ?? 'Error desconocido')
    setStage('failed')
    updateUrl('failed', job.id)
    toast.error('El procesamiento fallo')
  }

  function reset() {
    setStage('idle')
    setEstimate(null)
    setJobId(null)
    setResultJob(null)
    setErrorMsg(null)
    setProcessingConfig(null)
    updateUrl('idle')
  }

  function handleConfigured(config: ProcessingConfig) {
    setProcessingConfig(config)
    setStage('confirming')
    if (estimate) updateUrl('confirming', estimate.job_id)
  }

  const Icon = service.icon

  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Icon className={`h-7 w-7 ${service.color}`} />
          <div>
            <h1 className="text-2xl font-bold">{service.label}</h1>
            <p className="text-sm text-muted-foreground">{service.description}</p>
          </div>
        </div>

        <Card className="p-6">
          <ServiceStagePanel
            stage={stage}
            service={service}
            estimate={estimate}
            jobId={jobId}
            token={token}
            resultJob={resultJob}
            errorMsg={errorMsg}
            processingConfig={processingConfig}
            onInput={handleInput}
            onConfigured={handleConfigured}
            onDone={handleDone}
            onFailed={handleFailed}
            onReset={reset}
          />
        </Card>
      </main>

      <ConfirmModal
        estimate={estimate}
        open={stage === 'confirming'}
        loading={confirmLoading}
        userCredits={profile.credits}
        processingConfig={processingConfig}
        onConfirm={handleConfirm}
        onCancel={() => setStage('configuring')}
      />
    </>
  )
}
