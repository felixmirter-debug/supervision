'use client'

import { InputSelector } from './InputSelector'
import { ProcessingView } from './ProcessingView'
import { ResultView } from './ResultView'
import { ConfigurationView } from './ConfigurationView'
import { VideoReviewView, type VideoReviewSource } from './VideoReviewView'
import { TargetSelectionView } from './TargetSelectionView'
import type { InputType } from './InputSelector'
import type { EstimateResult, Job } from '@/lib/api'
import type { ServiceConfig } from '@/lib/services'
import type { AnalysisSegment, ProcessingConfig, TrackingTarget } from '@/lib/processing-config'

export type ServiceStage =
  | 'idle'
  | 'estimating'
  | 'reviewing'
  | 'selecting'
  | 'configuring'
  | 'confirming'
  | 'processing'
  | 'done'
  | 'failed'

interface Props {
  stage: ServiceStage
  service: ServiceConfig
  estimate: EstimateResult | null
  jobId: string | null
  token: string
  resultJob: Job | null
  errorMsg: string | null
  processingConfig: ProcessingConfig | null
  reviewSource: VideoReviewSource | null
  analysisSegment: AnalysisSegment | null
  targets: TrackingTarget[]
  onInput: (type: InputType, file?: File, url?: string) => void
  onReviewed: (segment: AnalysisSegment) => void
  onBackToReview: () => void
  onTargetsChange: (targets: TrackingTarget[]) => void
  onTargetsContinue: () => void
  onBackFromConfig: () => void
  onConfigured: (config: ProcessingConfig) => void
  onDone: (job: Job) => void
  onFailed: (job: Job) => void
  onReset: () => void
}

export function ServiceStagePanel({
  stage,
  service,
  estimate,
  jobId,
  token,
  resultJob,
  errorMsg,
  processingConfig,
  reviewSource,
  analysisSegment,
  targets,
  onInput,
  onReviewed,
  onBackToReview,
  onTargetsChange,
  onTargetsContinue,
  onBackFromConfig,
  onConfigured,
  onDone,
  onFailed,
  onReset,
}: Props) {
  if (stage === 'idle' || stage === 'estimating') {
    return <InputSelector onSubmit={onInput} loading={stage === 'estimating'} />
  }

  if (stage === 'reviewing' && estimate) {
    return (
      <VideoReviewView
        service={service}
        estimate={estimate}
        token={token}
        source={reviewSource}
        initialSegment={analysisSegment}
        onContinue={onReviewed}
        onCancel={onReset}
      />
    )
  }

  if (stage === 'selecting' && estimate) {
    return (
      <TargetSelectionView
        slug={service.apiSlug}
        jobId={estimate.job_id}
        token={token}
        videoUrl={reviewSource?.src ?? null}
        segment={analysisSegment}
        targets={targets}
        onChange={onTargetsChange}
        onBack={onBackToReview}
        onContinue={onTargetsContinue}
      />
    )
  }

  if (stage === 'configuring' && estimate) {
    return (
      <ConfigurationView
        service={service}
        estimate={estimate}
        token={token}
        initialConfig={processingConfig}
        analysisSegment={analysisSegment}
        onContinue={onConfigured}
        onCancel={onBackFromConfig}
      />
    )
  }

  if (stage === 'processing') {
    return <ProcessingView jobId={jobId!} token={token} onDone={onDone} onFailed={onFailed} />
  }

  if (stage === 'done' && resultJob) {
    return <ResultView job={resultJob} onReset={onReset} />
  }

  if (stage === 'failed') {
    return (
      <div className="py-8 text-center space-y-3">
        <p className="text-destructive font-medium">Procesamiento fallido</p>
        <p className="text-sm text-muted-foreground">{errorMsg}</p>
        <button onClick={onReset} className="text-sm text-brand hover:underline">
          Intentar de nuevo
        </button>
      </div>
    )
  }

  return null
}
