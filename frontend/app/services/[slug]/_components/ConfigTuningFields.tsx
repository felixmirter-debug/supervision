'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatClassFilter,
  parseClassFilter,
  type ProcessingConfig,
} from '@/lib/processing-config'

interface Props {
  config: ProcessingConfig
  onChange: (config: ProcessingConfig) => void
}

export function ConfigTuningFields({ config, onChange }: Props) {
  function updateConfidence(value: string) {
    const parsed = Number(value)
    const confidence = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : undefined
    onChange({ ...config, confidence })
  }

  function updateClasses(value: string) {
    onChange({ ...config, class_filter: parseClassFilter(value) })
  }

  const confidence = config.confidence ?? 0.25

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="confidence-input">Confianza minima</Label>
          <span className="rounded-md bg-background px-2 py-1 text-xs font-mono">
            {Math.round(confidence * 100)}%
          </span>
        </div>
        <input
          id="confidence-input"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={confidence}
          onChange={(event) => updateConfidence(event.target.value)}
          className="h-2 w-full cursor-pointer accent-brand"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="class-filter-input">Clases</Label>
        <Input
          id="class-filter-input"
          value={formatClassFilter(config.class_filter)}
          onChange={(event) => updateClasses(event.target.value)}
          placeholder="person, car, truck"
        />
      </div>
    </div>
  )
}
