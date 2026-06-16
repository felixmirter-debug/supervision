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

export type TargetStyle =
  | 'box'
  | 'ellipse'
  | 'triangle'
  | 'halo'
  | 'color'
  | 'trace'
  | 'spotlight'
  | 'label'

export type TrackingTarget = {
  id: string
  frame_idx: number
  bbox: { x1: number; y1: number; x2: number; y2: number }
  name: string
  color: string
  styles: TargetStyle[]
  cropB64?: string
}

export const MAX_TRACKING_TARGETS = 5

export type AnalysisSegment = {
  start_sec: number
  end_sec: number
  label?: string
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
  analysis_segment?: AnalysisSegment
  targets?: TrackingTarget[]
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
  if (config.analysis_segment) parts.push(`segmento ${formatSegmentRange(config.analysis_segment)}`)
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

export function segmentDuration(segment: AnalysisSegment | null | undefined): number {
  if (!segment) return 0
  return Math.max(0, segment.end_sec - segment.start_sec)
}

export function formatSegmentRange(segment: AnalysisSegment): string {
  return `${formatSegmentTime(segment.start_sec)}-${formatSegmentTime(segment.end_sec)}`
}

export function formatSegmentTime(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((Math.max(0, value) - totalSeconds) * 10)
  const padded = seconds.toString().padStart(2, '0')
  return tenths > 0 ? `${minutes}:${padded}.${tenths}` : `${minutes}:${padded}`
}
