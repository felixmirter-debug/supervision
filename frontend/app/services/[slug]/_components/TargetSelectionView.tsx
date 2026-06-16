'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DetectionPreviewEntry } from '@/lib/api'
import {
  MAX_ANCHORS_PER_TARGET,
  MAX_TRACKING_TARGETS,
  type AnalysisSegment,
  type TargetAnchor,
  type TrackingTarget,
} from '@/lib/processing-config'
import { SelectionPlayer } from './SelectionPlayer'
import { TargetPanel } from './TargetPanel'
import { useFrameDetection } from './useFrameDetection'

const PALETTE = ['#00ffcc', '#ff3366', '#ffd700', '#3399ff', '#aaff44']

interface Props {
  slug: string
  jobId: string | null
  token: string
  videoUrl: string | null
  segment: AnalysisSegment | null
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
  segment,
  targets,
  onChange,
  onBack,
  onContinue,
}: Props) {
  const { detections, frameIdx, fps, loading, error, detectAt, retryLowerConfidence } =
    useFrameDetection(slug, jobId, token)
  const [refiningTargetId, setRefiningTargetId] = useState<string | null>(null)
  const [lastAtSec, setLastAtSec] = useState(segment?.start_sec ?? 0)

  const startFrame = Math.round((segment?.start_sec ?? 0) * fps)

  function handleFrameSettled(atSec: number) {
    setLastAtSec(atSec)
    void detectAt(atSec)
  }

  function anchorFromDetection(det: DetectionPreviewEntry): TargetAnchor {
    return { frame_idx: Math.max(0, frameIdx - startFrame), bbox: det.bbox }
  }

  function handleToggle(det: DetectionPreviewEntry) {
    if (refiningTargetId) {
      const target = targets.find((t) => t.id === refiningTargetId)
      if (!target || target.anchors.length >= MAX_ANCHORS_PER_TARGET) return
      onChange(
        targets.map((t) =>
          t.id === refiningTargetId ? { ...t, anchors: [...t.anchors, anchorFromDetection(det)] } : t
        )
      )
      return
    }

    const existing = targets.find((t) =>
      t.anchors.some(
        (a) => Math.abs(a.bbox.x1 - det.bbox.x1) < 0.02 && Math.abs(a.bbox.y1 - det.bbox.y1) < 0.02
      )
    )
    if (existing) {
      onChange(targets.filter((t) => t.id !== existing.id))
      return
    }
    if (targets.length >= MAX_TRACKING_TARGETS) return
    const next: TrackingTarget = {
      id: crypto.randomUUID(),
      anchors: [anchorFromDetection(det)],
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
    if (refiningTargetId === id) setRefiningTargetId(null)
    onChange(targets.filter((t) => t.id !== id))
  }

  function removeAnchor(targetId: string, anchorIndex: number) {
    const target = targets.find((t) => t.id === targetId)
    if (!target) return
    const nextAnchors = target.anchors.filter((_, i) => i !== anchorIndex)
    if (nextAnchors.length === 0) {
      removeTarget(targetId)
      return
    }
    onChange(targets.map((t) => (t.id === targetId ? { ...t, anchors: nextAnchors } : t)))
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Selecciona objetos a seguir</h2>
        <p className="text-sm text-muted-foreground">
          Reproduce y pausa el video, luego haz clic sobre los objetos que quieres rastrear. Puedes
          continuar sin seleccionar ninguno para usar el modo automático.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <SelectionPlayer
            videoUrl={videoUrl}
            segment={segment}
            detections={detections}
            targets={targets}
            loading={loading}
            onFrameSettled={handleFrameSettled}
            onToggle={handleToggle}
          />
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="text-destructive">{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => retryLowerConfidence(lastAtSec)}
              >
                Reintentar con menor confianza
              </Button>
            </div>
          )}
          {!loading && !error && detections.length === 0 && (
            <p className="text-sm text-amber-500">
              No se detectaron objetos en este frame. Avanza/pausa en otro instante o baja la confianza.
            </p>
          )}
        </div>

        <div className="space-y-3">
          {refiningTargetId && (
            <p className="text-sm text-brand">
              Modo refinamiento: pausa donde se vea el objeto y haz clic sobre él para añadir un ancla.
            </p>
          )}
          <TargetPanel
            targets={targets}
            fps={fps}
            refiningTargetId={refiningTargetId}
            onUpdate={updateTarget}
            onRemove={removeTarget}
            onRemoveAnchor={removeAnchor}
            onToggleRefine={(id) => setRefiningTargetId((cur) => (cur === id ? null : id))}
          />
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
