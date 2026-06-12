'use client'

import Link from 'next/link'
import { ArrowRight, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
    <section className="surface-panel rounded-lg p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap className="size-4 text-brand" />
            Saldo operativo
          </div>
          <p className="mt-4 font-mono text-4xl">{formatCredits(profile.credits)}</p>
        </div>
        <Badge variant="secondary">{profile.plan}</Badge>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Aproximadamente {minutes > 0 ? `${minutes}m ` : ''}{secs}s en el servicio mas economico.
      </p>

      <div className="mt-5 space-y-2 border-t border-border pt-4">
        {SERVICES.map((service) => {
          const seconds = Math.floor(profile.credits / service.creditsPerSec)
          return (
            <div key={service.slug} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{service.label}</span>
              <span className="font-mono">{seconds}s</span>
            </div>
          )
        })}
      </div>

      <Link href="/services" className={cn(buttonVariants({ size: 'sm' }), 'mt-5 w-full gap-2')}>
        Usar creditos
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  )
}
