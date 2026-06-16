'use client'

import { Suspense, use } from 'react'
import { Nav } from '@/components/nav'
import { ConfirmModal } from './_components/ConfirmModal'
import { ServiceStagePanel } from './_components/ServiceStagePanel'
import { ServiceStageRail } from './_components/ServiceStageRail'
import { useServiceWorkflow } from './_components/useServiceWorkflow'

export default function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<ServiceFallback />}>
      <ServiceContent params={params} />
    </Suspense>
  )
}

function ServiceFallback() {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-muted-foreground">Cargando...</div>
    </>
  )
}

function ServiceContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const flow = useServiceWorkflow(slug)

  if (!flow.ready || !flow.service || !flow.profile) return null

  const Icon = flow.service.icon
  const reviewing = flow.stage === 'reviewing'
  const mainClass = reviewing
    ? 'mx-auto grid max-w-[1600px] gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8'
    : 'mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8'

  return (
    <>
      <Nav />
      <main className={mainClass}>
        <aside className="space-y-4">
          <section className={reviewing ? 'surface-panel rounded-lg p-4' : 'surface-panel rounded-lg p-5'}>
            <Icon className="mb-5 size-8 text-brand" />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Pipeline</p>
            <h1 className={reviewing ? 'mt-2 text-xl font-semibold' : 'mt-2 text-3xl font-semibold'}>
              {flow.service.label}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{flow.service.description}</p>
          </section>
          <ServiceStageRail stage={flow.stage} apiSlug={flow.service.apiSlug} />
        </aside>
        <section className={reviewing ? 'surface-panel min-h-[760px] rounded-lg p-4' : 'surface-panel min-h-[620px] rounded-lg p-5'}>
          <ServiceStagePanel
            stage={flow.stage}
            service={flow.service}
            estimate={flow.estimate}
            jobId={flow.jobId}
            token={flow.token}
            resultJob={flow.resultJob}
            errorMsg={flow.errorMsg}
            processingConfig={flow.processingConfig}
            reviewSource={flow.reviewSource}
            analysisSegment={flow.analysisSegment}
            targets={flow.targets}
            onInput={flow.handleInput}
            onReviewed={flow.handleReviewed}
            onBackToReview={flow.handleBackToReview}
            onTargetsChange={flow.handleTargetsChange}
            onTargetsContinue={flow.handleTargetsContinue}
            onBackFromConfig={flow.handleBackFromConfig}
            onConfigured={flow.handleConfigured}
            onDone={flow.handleDone}
            onFailed={flow.handleFailed}
            onReset={flow.reset}
          />
        </section>
      </main>

      <ConfirmModal
        estimate={flow.estimate}
        open={flow.stage === 'confirming'}
        loading={flow.confirmLoading}
        userCredits={flow.profile.credits}
        processingConfig={flow.processingConfig}
        onConfirm={flow.handleConfirm}
        onCancel={() => flow.setStage('configuring')}
      />
    </>
  )
}
