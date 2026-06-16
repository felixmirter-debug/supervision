'use client'

import { Badge } from '@/components/ui/badge'
import { formatPercent } from '@/lib/formatters'

export type TargetMetric = {
  name?: string
  color?: string
  frames_visible?: number
  tracked_coverage?: number
  distance_px?: number
}

interface Props {
  targets: TargetMetric[]
}

export function TargetMetricsCard({ targets }: Props) {
  if (targets.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <p className="text-sm font-semibold">Objetos seguidos</p>
      <ul className="mt-3 space-y-3" aria-label="Métricas por objeto">
        {targets.map((target, i) => {
          const coverage = target.tracked_coverage ?? 0
          const partial = coverage < 0.6
          return (
            <li key={`${target.name ?? 'objeto'}-${i}`} className="rounded-md border border-border/70 p-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: target.color ?? '#888888' }}
                  aria-hidden
                />
                <span className="flex-1 truncate text-sm font-medium">{target.name ?? `Objeto ${i + 1}`}</span>
                {partial && (
                  <Badge variant="secondary" className="text-[10px] text-amber-500">
                    Seguimiento parcial
                  </Badge>
                )}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Cobertura" value={formatPercent(coverage)} />
                <Stat label="Frames" value={String(target.frames_visible ?? 0)} />
                <Stat label="Distancia" value={`${Math.round(target.distance_px ?? 0)} px`} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono">{value}</p>
    </div>
  )
}
