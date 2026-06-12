'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { getPreviewFrame, previewJob } from '@/lib/api'
import type { EstimateResult, PreviewFrame, PreviewResult } from '@/lib/api'
import type { ServiceConfig } from '@/lib/services'
import {
  createDefaultProcessingConfig,
  summarizeProcessingConfig,
} from '@/lib/processing-config'
import type { AnalysisSegment, ConfigurableService, ProcessingConfig } from '@/lib/processing-config'
import { toast } from 'sonner'
import { ZoneEditor } from './ZoneEditor'
import { LineEditor } from './LineEditor'
import { RoiEditor } from './RoiEditor'
import { VideoFrameCanvas } from './VideoFrameCanvas'
import { PreviewInspector } from './PreviewInspector'

interface Props {
  service: ServiceConfig
  estimate: EstimateResult
  token: string
  initialConfig: ProcessingConfig | null
  analysisSegment: AnalysisSegment | null
  onContinue: (config: ProcessingConfig) => void
  onCancel: () => void
}

function frameSrc(frame: PreviewFrame | PreviewResult): string {
  return `data:image/jpeg;base64,${frame.image_base64}`
}

export function ConfigurationView({
  service,
  estimate,
  token,
  initialConfig,
  analysisSegment,
  onContinue,
  onCancel,
}: Props) {
  const [loadedFrame, setLoadedFrame] = useState<{ jobId: string; frame: PreviewFrame } | null>(null)
  const [config, setConfig] = useState<ProcessingConfig | null>(initialConfig)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const serviceKey = service.apiSlug as ConfigurableService
  const previewFrame = loadedFrame?.jobId === estimate.job_id ? loadedFrame.frame : null
  const loadingFrame = !previewFrame

  useEffect(() => {
    let cancelled = false
    const jobId = estimate.job_id

    const atSec = analysisSegment?.start_sec ?? 0

    getPreviewFrame(jobId, token, atSec)
      .then((frame) => {
        if (cancelled) return
        setLoadedFrame({ jobId, frame })
        setConfig((current) => {
          const next = current ?? createDefaultProcessingConfig(serviceKey, frame.width, frame.height)
          return analysisSegment ? { ...next, analysis_segment: analysisSegment } : next
        })
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'No se pudo cargar el frame')
      })

    return () => {
      cancelled = true
    }
  }, [analysisSegment, estimate.job_id, serviceKey, token])

  const summary = useMemo(() => summarizeProcessingConfig(config), [config])

  function updateConfig(nextConfig: ProcessingConfig) {
    setConfig(nextConfig)
    setPreview(null)
  }

  function updateZoneMode(mode: 'inside' | 'entry_exit') {
    if (!config) return
    updateConfig({ ...config, mode })
  }

  async function handlePreview() {
    if (!config) return
    setPreviewLoading(true)
    try {
      const segment = config.analysis_segment
      const seconds = segment ? Math.min(3, segment.end_sec - segment.start_sec) : 3
      const result = await previewJob(estimate.job_id, config, token, {
        at_sec: segment?.start_sec,
        seconds,
      })
      setPreview(result)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo previsualizar')
    } finally {
      setPreviewLoading(false)
    }
  }

  function resetConfig() {
    if (!previewFrame) return
    const next = createDefaultProcessingConfig(serviceKey, previewFrame.width, previewFrame.height)
    updateConfig(analysisSegment ? { ...next, analysis_segment: analysisSegment } : next)
  }

  if (loadingFrame || !previewFrame || !config) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">Preparando previsualizacion</p>
      </div>
    )
  }

  const source = preview ? frameSrc(preview) : frameSrc(previewFrame)
  const resolution = `${previewFrame.width}x${previewFrame.height}`
  const previewState = preview ? 'Muestra anotada' : 'Frame base'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Previsualizacion
          </p>
          <h2 className="mt-1 text-lg font-semibold">{service.label}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{previewState}</Badge>
          <Badge variant="outline">{resolution}</Badge>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          {service.apiSlug === 'zone_counting' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={config.mode === 'entry_exit' ? 'default' : 'outline'}
                  onClick={() => updateZoneMode('entry_exit')}
                >
                  Entrada/salida
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={config.mode !== 'entry_exit' ? 'default' : 'outline'}
                  onClick={() => updateZoneMode('inside')}
                >
                  Dentro de zona
                </Button>
              </div>
              <ZoneEditor imageSrc={source} config={config} onChange={updateConfig} />
            </div>
          ) : service.apiSlug === 'traffic' ? (
            <LineEditor imageSrc={source} config={config} onChange={updateConfig} />
          ) : service.apiSlug === 'ppe_detection' || service.apiSlug === 'quality_control' ? (
            <RoiEditor imageSrc={source} config={config} onChange={updateConfig} />
          ) : (
            <VideoFrameCanvas imageSrc={source} config={config} />
          )}
        </div>

        <PreviewInspector
          config={config}
          preview={preview}
          previewLoading={previewLoading}
          resolution={resolution}
          summary={summary}
          onChange={updateConfig}
          onPreview={handlePreview}
          onReset={resetConfig}
          onCancel={onCancel}
          onContinue={() => onContinue(config)}
        />
      </div>
    </div>
  )
}
