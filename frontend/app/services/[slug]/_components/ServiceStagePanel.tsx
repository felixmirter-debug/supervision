'use client'

import { InputSelector } from './InputSelector'
import { ProcessingView } from './ProcessingView'
import { ResultView } from './ResultView'
import { ConfigurationView } from './ConfigurationView'
import type { InputType } from './InputSelector'
import type { EstimateResult, Job } from '@/lib/api'
import type { ServiceConfig } from '@/lib/services'
import type { ProcessingConfig } from '@/lib/processing-config'

export type ServiceStage = 'idle' | 'estimating' | 'configuring' | 'confirming' | 'processing' | 'done' | 'failed'

interface Props {
  stage: ServiceStage
  service: ServiceConfig
  estimate: EstimateResult | null
  jobId: string | null
  token: string
  resultJob: Job | null
  errorMsg: string | null
  processingConfig: ProcessingConfig | null
  onInput: (type: InputType, file?: File, url?: string) => void
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
  onInput,
  onConfigured,
  onDone,
  onFailed,
  onReset,
}: Props) {
  if (stage === 'idle' || stage === 'estimating') {
    return <InputSelector onSubmit={onInput} loading={stage === 'estimating'} />
  }

  if (stage === 'configuring' && estimate) {
    return (
      <ConfigurationView
        service={service}
        estimate={estimate}
        token={token}
        initialConfig={processingConfig}
        onContinue={onConfigured}
        onCancel={onReset}
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
