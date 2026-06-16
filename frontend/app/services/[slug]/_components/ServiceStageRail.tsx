import { Check, Circle, Settings2 } from 'lucide-react'
import type { ServiceStage } from './ServiceStagePanel'

const BASE_STAGES: Array<{ value: ServiceStage; label: string }> = [
  { value: 'idle', label: 'Entrada' },
  { value: 'reviewing', label: 'Revisar' },
  { value: 'configuring', label: 'Configurar' },
  { value: 'confirming', label: 'Confirmar' },
  { value: 'processing', label: 'Procesar' },
  { value: 'done', label: 'Resultado' },
]

const SELECTING_STAGE: { value: ServiceStage; label: string } = {
  value: 'selecting',
  label: 'Selección',
}

export function ServiceStageRail({ stage, apiSlug }: { stage: ServiceStage; apiSlug?: string }) {
  const stages =
    apiSlug === 'tracking'
      ? [...BASE_STAGES.slice(0, 2), SELECTING_STAGE, ...BASE_STAGES.slice(2)]
      : BASE_STAGES
  const stageIndex = Math.max(0, stages.findIndex((item) => item.value === stage))

  return (
    <section className="surface-panel rounded-lg p-4">
      {stages.map((item, index) => {
        const complete = index < stageIndex
        const active = index === stageIndex

        return (
          <div key={item.value} className="flex items-center gap-3 py-2">
            <span className="flex size-7 items-center justify-center rounded-full border border-border bg-card">
              {complete && <Check className="size-3.5 text-brand" />}
              {active && <Settings2 className="size-3.5 text-brand" />}
              {!complete && !active && <Circle className="size-3 text-muted-foreground" />}
            </span>
            <span className={active ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
              {item.label}
            </span>
          </div>
        )
      })}
    </section>
  )
}
