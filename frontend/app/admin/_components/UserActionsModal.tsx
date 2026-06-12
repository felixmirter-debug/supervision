'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import type { AdminUser } from '@/lib/api'

type ActionType = 'ban' | 'unban' | 'credits'

interface Props {
  user: AdminUser | null
  action: ActionType | null
  open: boolean
  onConfirm: (reason?: string, amount?: number, description?: string) => Promise<void>
  onClose: () => void
}

export function UserActionsModal({ user, action, open, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  if (!user || !action) return null

  const titles: Record<ActionType, string> = {
    ban: 'Banear usuario',
    unban: 'Desbanear usuario',
    credits: 'Ajustar creditos',
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      await onConfirm(reason || undefined, amount || undefined, description || undefined)
      setReason('')
      setAmount(0)
      setDescription('')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    (action === 'ban' && reason.trim().length > 0) ||
    action === 'unban' ||
    (action === 'credits' && amount !== 0 && description.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[action]}</DialogTitle>
          <DialogDescription>
            Usuario <span className="font-mono text-xs">{user.id}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 rounded-lg border border-border bg-card/60 p-4">
          {action === 'ban' && (
            <div className="space-y-1.5">
              <Label htmlFor="ban-reason">Razon del ban</Label>
              <Input id="ban-reason" placeholder="Motivo..." value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}

          {action === 'unban' && (
            <p className="text-sm text-muted-foreground">
              Razon del ban: <em>{user.banned_reason ?? 'No especificada'}</em>
            </p>
          )}

          {action === 'credits' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="credits-amount">Cantidad</Label>
                <Input id="credits-amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="credits-desc">Descripcion obligatoria</Label>
                <Input id="credits-desc" placeholder="Motivo del ajuste..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant={action === 'ban' ? 'destructive' : 'default'} onClick={handleSubmit} disabled={loading || !canSubmit}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
