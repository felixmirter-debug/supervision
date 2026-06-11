'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
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
  { value: 'resolved_refund', label: 'Reembolsar créditos' },
  { value: 'resolved_no_action', label: 'Resolver sin acción' },
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolver reclamo</DialogTitle>
          <DialogDescription className="line-clamp-2">{claim.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Acción</Label>
            <div className="flex flex-col gap-1.5">
              {ACTIONS.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="action"
                    value={a.value}
                    checked={action === a.value}
                    onChange={() => setAction(a.value)}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          {action === 'resolved_refund' && (
            <div className="space-y-1.5">
              <Label htmlFor="credits-input">Créditos a reembolsar</Label>
              <Input
                id="credits-input"
                type="number"
                min={1}
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value))}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes-input">Notas (obligatorio)</Label>
            <Input
              id="notes-input"
              placeholder="Razón de la decisión..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
