'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DetectionPreviewEntry } from '@/lib/api'
import {
  MAX_TRACKING_TARGETS,
  type TrackingTarget,
} from '@/lib/processing-config'
import { DetectionOverlay } from './DetectionOverlay'
import { TargetPanel } from './TargetPanel'
import { nearestFrame, useDetectionPreview } from './useDetectionPreview'

const PALETTE = ['#00ffcc', '#ff3366', '#ffd700', '#3399ff', '#aaff44']

interface Props {
  slug: string
  jobId: string | null
  token: string
  videoUrl: string | null
  targets: TrackingTarget[]
  onChange: (targets: TrackingTarget[]) => void
  onBack: () => void
  onContinue: () => void
}

export function TargetSelectionView({
  slug,
  jobId,
  token,
  videoUrl,
  targets,
  onChange,
  onBack,
  onContinue,
}: Props) {
  const { loading, error, fps, frames, confidence, retryWithConfidence } =
    useDetectionPreview(slug, jobId, token)
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const frame = nearestFrame(frames, fps, currentTime)

  function handleToggle(det: DetectionPreviewEntry, frameIdx: number) {
    const existing = targets.find(
      (t) => Math.abs(t.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(t.bbox.y1 - det.bbox.y1) < 0.02
    )
    if (existing) {
      onChange(targets.filter((t) => t.id !== existing.id))
      return
    }
    if (targets.length >= MAX_TRACKING_TARGETS) return
    const next: TrackingTarget = {
      id: crypto.randomUUID(),
      frame_idx: frameIdx,
      bbox: det.bbox,
      name: `${det.class_name} ${targets.length + 1}`,
      color: PALETTE[targets.length % PALETTE.length],
      styles: ['ellipse', 'label'],
      cropB64: det.crop_b64,
    }
    onChange([...targets, next])
  }

  function updateTarget(id: string, patch: Partial<TrackingTarget>) {
    onChange(targets.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function removeTarget(id: string) {
    onChange(targets.filter((t) => t.id !== id))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecciona objetos a seguir</h2>
        <p className="text-sm text-muted-foreground">
          Reproduce el video y haz clic sobre los objetos que quieres rastrear. Puedes continuar sin
          seleccionar ninguno para usar el modo automático.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            <div className="flex aspect-video items-center justify-center">
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                />
              ) : (
                <p className="px-6 text-center text-sm text-white/65">Sin video disponible</p>
              )}
            </div>
            {frame && !loading && !error && (
              <DetectionOverlay
                detections={frame.detections}
                targets={targets}
                frameIdx={frame.frame_idx}
                onToggle={handleToggle}
              />
            )}
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground">Analizando frames del video…</p>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => retryWithConfidence(Math.max(0.1, confidence - 0.1))}
              >
                Reintentar con menor confianza
              </Button>
            </div>
          )}
          {!loading && !error && frames.length > 0 && !frame?.detections.length && (
            <p className="text-sm text-amber-500">
              No se detectaron objetos en este instante. Avanza el video o baja la confianza.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <TargetPanel targets={targets} onUpdate={updateTarget} onRemove={removeTarget} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Volver
        </Button>
        <Button type="button" onClick={onContinue}>
          {targets.length > 0 ? 'Continuar' : 'Continuar en modo automático'}
        </Button>
      </div>
    </div>
  )
}
