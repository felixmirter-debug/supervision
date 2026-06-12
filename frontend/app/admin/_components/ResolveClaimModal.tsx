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
import type { Claim } from '@/lib/api'

interface Props {
  claim: Claim | null
  open: boolean
  onResolve: (action: string, notes: string, credits: number) => Promise<void>
  onClose: () => void
}

const ACTIONS = [
  { value: 'resolved_refund', label: 'Reembolsar creditos' },
  { value: 'resolved_no_action', label: 'Resolver sin accion' },
  { value: 'rejected', label: 'Rechazar reclamo' },
]

export function ResolveClaimModal({ claim, open, onResolve, onClose }: Props) {
  const [action, setAction] = useState('resolved_no_action')
  const [notes, setNotes] = useState('')
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(false)

  if (!claim) return null

  async function handleSubmit() {
    if (!notes.trim()) return
    setLoading(true)
    try {
      await onResolve(action, notes, credits)
      setNotes('')
      setCredits(0)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver reclamo</DialogTitle>
          <DialogDescription className="line-clamp-2">{claim.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label>Accion</Label>
            <div className="grid gap-2">
              {ACTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAction(item.value)}
                  className={action === item.value
                    ? 'rounded-md border border-brand-border bg-brand-soft px-3 py-2 text-left text-sm font-medium'
                    : 'rounded-md border border-border bg-card/60 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted'
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {action === 'resolved_refund' && (
            <div className="space-y-1.5">
              <Label htmlFor="credits-input">Creditos a reembolsar</Label>
              <Input id="credits-input" type="number" min={1} value={credits} onChange={(e) => setCredits(Number(e.target.value))} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes-input">Notas obligatorias</Label>
            <Input id="notes-input" placeholder="Razon de la decision..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || !notes.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
