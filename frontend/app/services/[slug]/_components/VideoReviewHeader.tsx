'use client'

import { Badge } from '@/components/ui/badge'
import type { ServiceConfig } from '@/lib/services'
import type { AnalysisSegment } from '@/lib/processing-config'
import { formatSegmentRange } from '@/lib/processing-config'
import type { VideoReviewSource } from './VideoReviewView'

interface Props {
  service: ServiceConfig
  source: VideoReviewSource | null
  segment: AnalysisSegment
}

export function VideoReviewHeader({ service, source, segment }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revision de video</p>
        <h2 className="mt-1 text-lg font-semibold">{service.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reproduce, revisa miniaturas y marca el segmento exacto a analizar.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{source?.inputType === 'url' ? 'URL' : 'Archivo'}</Badge>
        <Badge variant="outline">{formatSegmentRange(segment)}</Badge>
      </div>
    </div>
  )
}
