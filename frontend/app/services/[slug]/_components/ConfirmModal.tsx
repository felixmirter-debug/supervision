'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Zap } from 'lucide-react'
import { formatCredits, formatDuration } from '@/lib/formatters'
import type { EstimateResult } from '@/lib/api'
import type { ProcessingConfig } from '@/lib/processing-config'
import { segmentDuration, summarizeProcessingConfig } from '@/lib/processing-config'

interface Props {
  estimate: EstimateResult | null
  open: boolean
  loading: boolean
  userCredits: number
  processingConfig: ProcessingConfig | null
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  estimate,
  open,
  loading,
  userCredits,
  processingConfig,
  onConfirm,
  onCancel,
}: Props) {
  if (!estimate) return null

  const selectedDuration = segmentDuration(processingConfig?.analysis_segment) || estimate.duration_sec
  const baseCredits = Math.ceil(selectedDuration * estimate.credits_per_sec)
  const targetCount = processingConfig?.targets?.length ?? 0
  const hasTargets = targetCount > 0
  const selectedCredits = hasTargets ? Math.round(baseCredits * 1.3) : baseCredits
  const enough = userCredits >= selectedCredits
  const shortfall = selectedCredits - userCredits

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar procesamiento</DialogTitle>
          <DialogDescription>
            Revisa costo, saldo y configuracion antes de gastar creditos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Duracion seleccionada</span>
            <span className="font-mono">{formatDuration(selectedDuration)}</span>
          </div>
          <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tarifa</span>
            <span className="font-mono">{estimate.credits_per_sec} cr/s</span>
          </div>
          {hasTargets && (
            <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Seguimiento personalizado de {targetCount} objeto(s) — recargo Re-ID ×1.3
              </span>
              <span className="font-mono">{formatCredits(baseCredits)} → {formatCredits(selectedCredits)}</span>
            </div>
          )}
          <div className="flex justify-between rounded-md border border-brand-border bg-brand-soft px-3 py-3 text-sm font-semibold">
            <span>Costo estimado</span>
            <span className="flex items-center gap-1 text-brand">
              <Zap className="h-4 w-4" />
              {formatCredits(selectedCredits)}
            </span>
          </div>
          <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tu saldo</span>
            <span className={enough ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
              {formatCredits(userCredits)}
            </span>
          </div>
          <div className="rounded-md border border-border bg-card/70 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Configuracion</p>
            <p className="mt-1 font-medium">{summarizeProcessingConfig(processingConfig)}</p>
          </div>
          {!enough && (
            <p className="text-sm text-destructive">
              Creditos insuficientes. Necesitas {shortfall} cr mas.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Volver a configurar
          </Button>
          <Button onClick={onConfirm} disabled={loading || !enough}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar y procesar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
