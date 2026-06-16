import { useCallback, useEffect, useState } from 'react'
import { getDetectionPreview, type DetectionPreviewFrame } from '@/lib/api'

interface State {
  loading: boolean
  error: string | null
  fps: number
  frames: DetectionPreviewFrame[]
}

const INITIAL: State = { loading: true, error: null, fps: 30, frames: [] }

export function useDetectionPreview(slug: string, jobId: string | null, token: string) {
  const [state, setState] = useState<State>(INITIAL)
  const [confidence, setConfidence] = useState(0.25)

  const load = useCallback(
    async (conf: number) => {
      if (!jobId) return
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await getDetectionPreview(slug, { job_id: jobId, confidence: conf }, token)
        setState({ loading: false, error: null, fps: res.fps, frames: res.frames })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al cargar detecciones'
        setState((prev) => ({ ...prev, loading: false, error: message }))
      }
    },
    [jobId, slug, token]
  )

  useEffect(() => {
    void load(confidence)
  }, [load])

  const retryWithConfidence = useCallback(
    (conf: number) => {
      setConfidence(conf)
      void load(conf)
    },
    [load]
  )

  return { ...state, confidence, retryWithConfidence }
}

export function nearestFrame(
  frames: DetectionPreviewFrame[],
  fps: number,
  currentTimeSec: number
): DetectionPreviewFrame | null {
  if (frames.length === 0) return null
  const targetIdx = Math.round(currentTimeSec * fps)
  let best = frames[0]
  let bestDist = Math.abs(best.frame_idx - targetIdx)
  for (const frame of frames) {
    const dist = Math.abs(frame.frame_idx - targetIdx)
    if (dist < bestDist) {
      best = frame
      bestDist = dist
    }
  }
  return best
}
