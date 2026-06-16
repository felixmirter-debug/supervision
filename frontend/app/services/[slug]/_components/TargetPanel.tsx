'use client'

import { MAX_ANCHORS_PER_TARGET, MAX_TRACKING_TARGETS, type TargetStyle, type TrackingTarget } from '@/lib/processing-config'

const STYLE_LABELS: Record<TargetStyle, string> = {
  box: 'Caja',
  ellipse: 'Elipse',
  triangle: 'Flecha',
  halo: 'Halo',
  color: 'Tinte',
  trace: 'Estela',
  spotlight: 'Foco',
  label: 'Etiqueta',
}

interface Props {
  targets: TrackingTarget[]
  fps: number
  refiningTargetId: string | null
  onUpdate: (id: string, patch: Partial<TrackingTarget>) => void
  onRemove: (id: string) => void
  onRemoveAnchor: (targetId: string, anchorIndex: number) => void
  onToggleRefine: (id: string) => void
}

function toggleStyle(styles: TargetStyle[], style: TargetStyle): TargetStyle[] {
  if (styles.includes(style)) return styles.filter((s) => s !== style)
  return [...styles, style]
}

export function TargetPanel({ targets, fps, refiningTargetId, onUpdate, onRemove, onRemoveAnchor, onToggleRefine }: Props) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Haz clic sobre un objeto del video para seguirlo. Máximo {MAX_TRACKING_TARGETS}.
      </p>
    )
  }
  return (
    <ul className="space-y-3" aria-label="Objetos seleccionados">
      {targets.map((target) => (
        <li key={target.id} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            {target.cropB64 && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`data:image/jpeg;base64,${target.cropB64}`}
                alt={target.name}
                className="h-10 w-10 rounded object-cover"
              />
            )}
            <input
              value={target.name}
              onChange={(e) => onUpdate(target.id, { name: e.target.value })}
              className="flex-1 rounded border bg-background px-2 py-1 text-sm"
              aria-label="Nombre del objeto"
              maxLength={40}
            />
            <input
              type="color"
              value={target.color}
              onChange={(e) => onUpdate(target.id, { color: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded"
              aria-label="Color del resaltado"
            />
            <button
              onClick={() => onRemove(target.id)}
              className="text-sm text-destructive hover:underline"
              aria-label={`Quitar ${target.name}`}
            >
              Quitar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(STYLE_LABELS) as TargetStyle[]).map((style) => {
              const active = target.styles.includes(style)
              const base = 'rounded-full border px-2 py-0.5 text-xs transition-colors'
              const cls = active
                ? `${base} border-primary bg-primary/15 text-primary`
                : `${base} text-muted-foreground hover:border-primary/50`
              return (
                <button
                  key={style}
                  className={cls}
                  aria-pressed={active}
                  onClick={() => onUpdate(target.id, { styles: toggleStyle(target.styles, style) })}
                >
                  {STYLE_LABELS[style]}
                </button>
              )
            })}
          </div>
          <div className="mt-3 border-t border-border/60 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Anclas ({target.anchors.length}/{MAX_ANCHORS_PER_TARGET})
              </span>
              <button
                type="button"
                className={
                  refiningTargetId === target.id
                    ? 'rounded-full border border-brand bg-brand/15 px-2 py-0.5 text-xs text-brand'
                    : 'rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-brand/50'
                }
                aria-pressed={refiningTargetId === target.id}
                disabled={refiningTargetId !== target.id && target.anchors.length >= MAX_ANCHORS_PER_TARGET}
                onClick={() => onToggleRefine(target.id)}
              >
                {refiningTargetId === target.id ? 'Refinando…' : 'Refinar'}
              </button>
            </div>
            <ul className="mt-1.5 space-y-1">
              {target.anchors.map((anchor, i) => (
                <li key={`${anchor.frame_idx}-${i}`} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-muted-foreground">
                    +{(anchor.frame_idx / (fps || 30)).toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    className="text-destructive hover:underline"
                    aria-label={`Quitar ancla ${i + 1}`}
                    onClick={() => onRemoveAnchor(target.id, i)}
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
      {targets.length >= MAX_TRACKING_TARGETS && (
        <p className="text-xs text-amber-500">Límite de {MAX_TRACKING_TARGETS} objetos alcanzado.</p>
      )}
    </ul>
  )
}
