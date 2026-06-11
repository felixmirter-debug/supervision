export type NormalizedPoint = {
  x: number
  y: number
}

export type ZoneConfig = {
  id: string
  label: string
  points: NormalizedPoint[]
}

export type LineConfig = {
  id: string
  label: string
  start: NormalizedPoint
  end: NormalizedPoint
  direction?: 'in_out' | 'out_in'
}

export type RoiConfig = {
  id: string
  label: string
  points: NormalizedPoint[]
}

export type ProcessingConfig = {
  frame_width: number
  frame_height: number
  confidence?: number
  class_filter?: string[]
  zones?: ZoneConfig[]
  lines?: LineConfig[]
  rois?: RoiConfig[]
  mode?: 'inside' | 'entry_exit'
}

export type ConfigurableService =
  | 'zone_counting'
  | 'tracking'
  | 'ppe_detection'
  | 'traffic'
  | 'quality_control'

export function createDefaultProcessingConfig(
  service: ConfigurableService,
  width: number,
  height: number
): ProcessingConfig {
  const base: ProcessingConfig = {
    frame_width: width,
    frame_height: height,
    confidence: 0.25,
  }

  if (service === 'traffic') {
    return {
      ...base,
      class_filter: ['car', 'truck', 'bus', 'motorcycle', 'bicycle'],
      lines: [{
        id: 'line-1',
        label: 'Linea 1',
        start: { x: 0.08, y: 0.5 },
        end: { x: 0.92, y: 0.5 },
        direction: 'in_out',
      }],
    }
  }

  if (service === 'zone_counting') {
    return { ...base, mode: 'inside', zones: [] }
  }

  if (service === 'ppe_detection' || service === 'quality_control') {
    return { ...base, rois: [] }
  }

  return base
}

export function clampPoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  }
}

export function summarizeProcessingConfig(config: ProcessingConfig | null | undefined): string {
  if (!config) return 'Sin configuracion visual'
  const parts: string[] = []
  const zoneCount = config.zones?.length ?? 0
  const lineCount = config.lines?.length ?? 0
  const roiCount = config.rois?.length ?? 0
  if (zoneCount > 0) parts.push(`${zoneCount} zona${zoneCount === 1 ? '' : 's'}`)
  if (lineCount > 0) parts.push(`${lineCount} linea${lineCount === 1 ? '' : 's'}`)
  if (roiCount > 0) parts.push(`${roiCount} ROI`)
  if (config.class_filter?.length) parts.push(`${config.class_filter.length} clases`)
  if (typeof config.confidence === 'number') parts.push(`conf. ${Math.round(config.confidence * 100)}%`)
  return parts.length > 0 ? parts.join(' · ') : 'Configuracion base'
}

export function parseClassFilter(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function formatClassFilter(values: string[] | undefined): string {
  return (values ?? []).join(', ')
}
