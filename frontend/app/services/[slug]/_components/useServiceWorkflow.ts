import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { estimateService, getJob, processService, type EstimateResult, type Job } from '@/lib/api'
import { getService, type ServiceConfig } from '@/lib/services'
import type { AnalysisSegment, ProcessingConfig, TrackingTarget } from '@/lib/processing-config'
import { useAuthStore } from '@/stores/auth-store'
import type { InputType } from './InputSelector'
import type { ServiceStage } from './ServiceStagePanel'
import type { VideoReviewSource } from './VideoReviewView'

export function useServiceWorkflow(slug: string) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, profile } = useAuthStore()
  const service = getService(slug)
  const [stage, setStage] = useState<ServiceStage>('idle')
  const [estimate, setEstimate] = useState<EstimateResult | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [resultJob, setResultJob] = useState<Job | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [processingConfig, setProcessingConfig] = useState<ProcessingConfig | null>(null)
  const [reviewSource, setReviewSource] = useState<VideoReviewSource | null>(null)
  const [analysisSegment, setAnalysisSegment] = useState<AnalysisSegment | null>(null)
  const [targets, setTargets] = useState<TrackingTarget[]>([])
  const reviewObjectUrlRef = useRef<string | null>(null)
  const token = session?.access_token ?? ''

  const updateUrl = useCallback((nextStage: ServiceStage, id?: string | null) => {
    const query = id ? `?job=${id}&stage=${nextStage}` : ''
    router.replace(`/services/${slug}${query}`, { scroll: false })
  }, [router, slug])

  const restoreJob = useCallback((job: Job, queryStage: string | null, selectedService: ServiceConfig) => {
    if (job.status === 'done') {
      setResultJob(job)
      setProcessingConfig(job.processing_config)
      setAnalysisSegment(job.processing_config?.analysis_segment ?? null)
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
      credits_per_sec: selectedService.creditsPerSec,
      service: job.service,
    })
    setJobId(job.id)
    setProcessingConfig(job.processing_config)
    setAnalysisSegment(job.processing_config?.analysis_segment ?? null)
    if ((queryStage === 'configuring' || queryStage === 'confirming') && job.processing_config) {
      setStage(queryStage)
      return
    }
    setStage('reviewing')
  }, [])

  useEffect(() => {
    if (!service) router.replace('/services')
  }, [router, service])

  useEffect(() => {
    if (!session || !profile) router.replace('/login')
  }, [profile, router, session])

  useEffect(() => {
    return () => {
      if (reviewObjectUrlRef.current) URL.revokeObjectURL(reviewObjectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const queryJobId = searchParams.get('job')
    const queryStage = searchParams.get('stage')
    if (!queryJobId || estimate || jobId || resultJob || !session || !service) return

    getJob(queryJobId, session.access_token)
      .then((job) => restoreJob(job, queryStage, service))
      .catch(() => updateUrl('idle'))
  }, [estimate, jobId, restoreJob, resultJob, searchParams, service, session, updateUrl])

  function replaceReviewSource(next: VideoReviewSource | null, objectUrl?: string) {
    if (reviewObjectUrlRef.current && reviewObjectUrlRef.current !== objectUrl) {
      URL.revokeObjectURL(reviewObjectUrlRef.current)
    }
    reviewObjectUrlRef.current = objectUrl ?? null
    setReviewSource(next)
  }

  async function handleInput(type: InputType, file?: File, url?: string) {
    setStage('estimating')
    try {
      const fd = new FormData()
      fd.append('input_type', type)
      if (type === 'upload' && file) {
        fd.append('file', file)
        const objectUrl = URL.createObjectURL(file)
        replaceReviewSource({ inputType: type, src: objectUrl, label: file.name }, objectUrl)
      }
      if (type === 'url' && url) {
        fd.append('input_url', url)
        replaceReviewSource({ inputType: type, src: url, label: url })
      }
      const est = await estimateService(slug, fd, token)
      setEstimate(est)
      setJobId(est.job_id)
      setAnalysisSegment({ start_sec: 0, end_sec: est.duration_sec, label: 'Seleccion principal' })
      setProcessingConfig(null)
      setStage('reviewing')
      updateUrl('reviewing', est.job_id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al estimar')
      replaceReviewSource(null)
      setStage('idle')
    }
  }

  async function handleConfirm() {
    if (!estimate) return
    setConfirmLoading(true)
    try {
      // El backend ignora `id` y `cropB64`; se omiten para enviar un payload limpio.
      const apiTargets = targets.map(({ id: _id, cropB64: _crop, ...rest }) => rest)
      const configToSend: ProcessingConfig | undefined = targets.length > 0 && processingConfig
        ? { ...processingConfig, targets: apiTargets as ProcessingConfig['targets'] }
        : processingConfig ?? undefined
      const res = await processService(
        slug,
        { job_id: estimate.job_id, confirmed: true, processing_config: configToSend },
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
    setAnalysisSegment(job.processing_config?.analysis_segment ?? null)
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
    setAnalysisSegment(null)
    setTargets([])
    replaceReviewSource(null)
    updateUrl('idle')
  }

  function handleReviewed(segment: AnalysisSegment) {
    setAnalysisSegment(segment)
    setProcessingConfig((current) => current ? { ...current, analysis_segment: segment } : current)
    const nextStage: ServiceStage = service?.apiSlug === 'tracking' ? 'selecting' : 'configuring'
    setStage(nextStage)
    if (estimate) updateUrl(nextStage, estimate.job_id)
  }

  function handleTargetsContinue() {
    setStage('configuring')
    if (estimate) updateUrl('configuring', estimate.job_id)
  }

  function handleBackFromConfig() {
    const nextStage: ServiceStage = service?.apiSlug === 'tracking' ? 'selecting' : 'reviewing'
    setStage(nextStage)
    if (estimate) updateUrl(nextStage, estimate.job_id)
  }

  function handleBackToReview() {
    setStage('reviewing')
    if (estimate) updateUrl('reviewing', estimate.job_id)
  }

  function handleConfigured(config: ProcessingConfig) {
    setProcessingConfig(analysisSegment ? { ...config, analysis_segment: analysisSegment } : config)
    setStage('confirming')
    if (estimate) updateUrl('confirming', estimate.job_id)
  }

  return {
    service,
    profile,
    token,
    stage,
    estimate,
    jobId,
    resultJob,
    errorMsg,
    confirmLoading,
    processingConfig,
    reviewSource,
    analysisSegment,
    targets,
    ready: Boolean(service && session && profile),
    handleInput,
    handleReviewed,
    handleBackToReview,
    handleTargetsChange: setTargets,
    handleTargetsContinue,
    handleBackFromConfig,
    handleConfigured,
    handleConfirm,
    handleDone,
    handleFailed,
    reset,
    setStage,
  }
}
