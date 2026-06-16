import { useCallback, useRef, useState } from 'react'
import { getDetectionAt, type DetectionPreviewEntry } from '@/lib/api'

interface State {
  detections: DetectionPreviewEntry[]
  frameIdx: number
  fps: number
  loading: boolean
  error: string | null
}

const INITIAL: State = { detections: [], frameIdx: 0, fps: 30, loading: false, error: null }

/** Detección bajo demanda de un único frame (en `at_sec`) para refinar la
 *  selección con cajas alineadas a ese instante exacto. */
export function useFrameDetection(slug: string, jobId: string | null, token: string) {
  const [state, setState] = useState<State>(INITIAL)
  const [confidence, setConfidence] = useState(0.25)
  const reqIdRef = useRef(0)

  const detectAt = useCallback(
    async (atSec: number, conf?: number) => {
      if (!jobId) return
      const usedConf = conf ?? confidence
      const reqId = ++reqIdRef.current
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await getDetectionAt(slug, { job_id: jobId, at_sec: atSec, confidence: usedConf }, token)
        if (reqId !== reqIdRef.current) return // descarta respuestas obsoletas (seeks rápidos)
        setState({ detections: res.detections, frameIdx: res.frame_idx, fps: res.fps, loading: false, error: null })
      } catch (err: unknown) {
        if (reqId !== reqIdRef.current) return
        const message = err instanceof Error ? err.message : 'Error al detectar el frame'
        setState((prev) => ({ ...prev, loading: false, error: message }))
      }
    },
    [jobId, slug, token, confidence]
  )

  const retryLowerConfidence = useCallback(
    (atSec: number) => {
      const next = Math.max(0.1, confidence - 0.1)
      setConfidence(next)
      void detectAt(atSec, next)
    },
    [confidence, detectAt]
  )

  return { ...state, confidence, detectAt, retryLowerConfidence }
}
