import { Activity, Crosshair, Gauge, ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VisionPreviewProps {
  compact?: boolean
  className?: string
}

const boxes = [
  { label: 'person 0.94', className: 'left-[12%] top-[20%] h-[42%] w-[18%]' },
  { label: 'helmet 0.88', className: 'left-[57%] top-[17%] h-[20%] w-[15%]' },
  { label: 'vehicle 0.91', className: 'left-[50%] top-[55%] h-[23%] w-[34%]' },
]

export function VisionPreview({ compact = false, className }: VisionPreviewProps) {
  return (
    <div className={cn('surface-panel overflow-hidden rounded-lg', className)}>
      <div className="flex items-center justify-between border-b border-border bg-card/75 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full bg-brand" />
          Live inference frame
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
          <span>YOLOv8</span>
          <span>38ms</span>
        </div>
      </div>
      <div className={cn('vision-grid relative bg-slate-950', compact ? 'h-56' : 'h-[420px]')}>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,oklch(1_0_0_/_8%)),linear-gradient(180deg,oklch(0.13_0.03_238),oklch(0.23_0.04_238))]" />
        <div className="absolute left-[8%] top-[12%] h-[78%] w-[1px] bg-brand/60" />
        <div className="absolute left-[8%] top-[12%] h-[1px] w-[82%] bg-brand/60" />
        <div className="absolute bottom-[14%] left-[18%] h-[1px] w-[72%] bg-white/20" />
        {boxes.map((box) => (
          <div
            key={box.label}
            className={cn('absolute border border-brand bg-brand/10 shadow-[0_0_24px_var(--brand-soft)]', box.className)}
          >
            <span className="absolute -top-6 left-0 rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
              {box.label}
            </span>
          </div>
        ))}
        <div className="absolute right-4 top-4 grid gap-2 text-xs">
          {[
            ['fps', '24.8'],
            ['tracks', '18'],
            ['credits', '0.8/s'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-8 rounded-md border border-white/10 bg-black/35 px-3 py-2 text-white backdrop-blur">
              <span className="text-white/60">{label}</span>
              <span className="font-mono">{value}</span>
            </div>
          ))}
        </div>
        <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
          {[
            { icon: Crosshair, label: 'Zones', value: '3 active' },
            { icon: Activity, label: 'Events', value: '126' },
            { icon: Gauge, label: 'Confidence', value: '91%' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="rounded-md border border-white/10 bg-black/35 p-3 text-white backdrop-blur">
                <Icon className="mb-2 size-4 text-brand" />
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">{item.label}</p>
                <p className="font-mono text-sm">{item.value}</p>
              </div>
            )
          })}
        </div>
        <ScanLine className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 text-brand/35" />
      </div>
    </div>
  )
}
