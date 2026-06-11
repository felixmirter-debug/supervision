'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatCredits } from '@/lib/formatters'
import { SERVICES } from '@/lib/services'
import type { Profile } from '@/stores/auth-store'

export function CreditsCard({ profile }: { profile: Profile }) {
  const cheapest = Math.min(...SERVICES.map((s) => s.creditsPerSec))
  const secondsLeft = Math.floor(profile.credits / cheapest)
  const minutes = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-brand" />
          <h2 className="font-semibold">Créditos</h2>
        </div>
        <Badge variant="secondary" className="font-mono text-base px-3 py-1">
          {formatCredits(profile.credits)}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Equivale a ≈{minutes > 0 ? `${minutes}m ` : ''}{secs}s de procesamiento (servicio más económico)
      </p>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {SERVICES.map((s) => {
          const secs = Math.floor(profile.credits / s.creditsPerSec)
          return (
            <div key={s.slug} className="flex justify-between text-muted-foreground">
              <span>{s.label}</span>
              <span className="font-mono">{secs}s</span>
            </div>
          )
        })}
      </div>

      <Link
        href="/services"
        className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'w-full')}
      >
        Usar créditos
      </Link>
    </Card>
  )
}
