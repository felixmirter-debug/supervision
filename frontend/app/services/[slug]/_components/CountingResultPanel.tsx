'use client'

export type CountingLineMetric = {
  label: string
  in_label: string
  out_label: string
  in_total: number
  out_total: number
  by_class_in: Record<string, number>
  by_class_out: Record<string, number>
}

export type CountingZoneMetric = {
  label: string
  peak_occupancy: number
  peak_at_sec: number
  avg_occupancy: number
  max_count: number
}

interface Props {
  lines: CountingLineMetric[]
  zones: CountingZoneMetric[]
}

function classBreakdown(byClass: Record<string, number>): string {
  const entries = Object.entries(byClass)
  if (entries.length === 0) return '—'
  return entries.map(([name, n]) => `${name}: ${n}`).join(' · ')
}

export function CountingResultPanel({ lines, zones }: Props) {
  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold">Cruces por línea</p>
          <ul className="mt-3 space-y-3">
            {lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className="rounded-md border border-border/70 p-2.5">
                <p className="text-sm font-medium">{line.label}</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted-foreground">{line.in_label}</p>
                    <p className="mt-0.5 font-mono text-base">{line.in_total}</p>
                    <p className="mt-0.5 text-muted-foreground">{classBreakdown(line.by_class_in)}</p>
                  </div>
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-muted-foreground">{line.out_label}</p>
                    <p className="mt-0.5 font-mono text-base">{line.out_total}</p>
                    <p className="mt-0.5 text-muted-foreground">{classBreakdown(line.by_class_out)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {zones.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-sm font-semibold">Ocupación por zona</p>
          <ul className="mt-3 space-y-2">
            {zones.map((zone, i) => (
              <li key={`${zone.label}-${i}`} className="flex items-center justify-between rounded-md border border-border/70 p-2.5 text-xs">
                <span className="font-medium">{zone.label}</span>
                <span className="font-mono text-muted-foreground">
                  pico {zone.peak_occupancy} @ {zone.peak_at_sec}s · prom {zone.avg_occupancy}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
