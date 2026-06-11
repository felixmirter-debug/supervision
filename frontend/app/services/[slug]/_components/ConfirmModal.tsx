'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Zap } from 'lucide-react'
import { formatCredits, formatDuration } from '@/lib/formatters'
import type { EstimateResult } from '@/lib/api'
import type { ProcessingConfig } from '@/lib/processing-config'
import { summarizeProcessingConfig } from '@/lib/processing-config'

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

  const enough = userCredits >= estimate.credits_estimated

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar procesamiento</DialogTitle>
          <DialogDescription>
            Revisa el costo estimado antes de procesar tu video.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Duración</span>
            <span className="font-mono">{formatDuration(estimate.duration_sec)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tarifa</span>
            <span className="font-mono">{estimate.credits_per_sec} cr/s</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-border pt-2 mt-2">
            <span>Costo estimado</span>
            <span className="flex items-center gap-1 text-brand">
              <Zap className="h-4 w-4" />
              {formatCredits(estimate.credits_estimated)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tu saldo</span>
            <span className={enough ? 'text-green-400' : 'text-red-400'}>
              {formatCredits(userCredits)}
            </span>
          </div>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="text-xs text-muted-foreground">Configuracion</p>
            <p className="mt-1 font-medium">{summarizeProcessingConfig(processingConfig)}</p>
          </div>
          {!enough && (
            <p className="text-sm text-destructive">
              Créditos insuficientes. Necesitas {estimate.credits_estimated - userCredits} cr más.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancelar
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
