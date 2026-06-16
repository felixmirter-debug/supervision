import type { AnalysisSegment, ProcessingConfig } from '@/lib/processing-config'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {}

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, error.detail || 'Request failed')
  }

  return res.json() as Promise<T>
}

async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<Blob> {
  const headers: Record<string, string> = {}

  if (!(options.body instanceof FormData) && options.body) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, error.detail || 'Request failed')
  }

  return res.blob()
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Job = {
  id: string
  status: 'pending' | 'estimating' | 'confirmed' | 'processing' | 'done' | 'failed' | 'refunded'
  service: string
  input_type: string
  duration_sec: number | null
  credits_estimated: number | null
  credits_used: number | null
  result_url: string | null
  metrics: Record<string, unknown> | null
  processing_config: ProcessingConfig | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export type EstimateResult = {
  job_id: string
  duration_sec: number
  credits_estimated: number
  credits_per_sec: number
  service: string
}

export type PreviewFrame = {
  job_id: string
  image_base64: string
  width: number
  height: number
  duration_sec: number | null
  at_sec: number
}

export type PreviewResult = {
  job_id: string
  image_base64: string
  width: number
  height: number
  metrics: Record<string, unknown>
  sampled_frames: number
}

export type DetectionPreviewEntry = {
  bbox: { x1: number; y1: number; x2: number; y2: number }
  class_name: string
  confidence: number
  crop_b64: string
}

export type DetectionPreviewFrame = {
  frame_idx: number
  detections: DetectionPreviewEntry[]
}

export type DetectionPreviewResult = {
  job_id: string
  fps: number
  frames: DetectionPreviewFrame[]
}

export type DetectionAtResult = {
  job_id: string
  fps: number
  frame_idx: number
  detections: DetectionPreviewEntry[]
}

export type Claim = {
  id: string
  user_id: string
  job_id: string | null
  type: string
  description: string
  status: string
  admin_notes: string | null
  credits_returned: number
  created_at: string
  resolved_at: string | null
}

export type AdminUser = {
  id: string
  role: 'user' | 'admin'
  credits: number
  plan: string
  total_jobs: number
  total_spent: number
  banned_at: string | null
  banned_reason: string | null
  created_at: string
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export function getJob(jobId: string, token: string): Promise<Job> {
  return apiFetch<Job>(`/jobs/${jobId}`, {}, token)
}

export function getPreviewFrame(
  jobId: string,
  token: string,
  at = 0
): Promise<PreviewFrame> {
  return apiFetch<PreviewFrame>(`/jobs/${jobId}/preview-frame?at=${at}`, {}, token)
}

export function previewJob(
  jobId: string,
  processingConfig: ProcessingConfig,
  token: string,
  options?: { at_sec?: number; seconds?: number }
): Promise<PreviewResult> {
  return apiFetch<PreviewResult>(
    `/jobs/${jobId}/preview`,
    {
      method: 'POST',
      body: JSON.stringify({
        processing_config: processingConfig,
        at_sec: options?.at_sec ?? processingConfig.analysis_segment?.start_sec ?? 0,
        seconds: options?.seconds ?? 3,
        sample_fps: 2,
      }),
    },
    token
  )
}

export function getSourcePreview(jobId: string, token: string): Promise<Blob> {
  return apiFetchBlob(`/jobs/${jobId}/source-preview`, {}, token)
}

export function exportJobClip(
  jobId: string,
  segment: AnalysisSegment,
  token: string
): Promise<Blob> {
  return apiFetchBlob(
    `/jobs/${jobId}/export-clip`,
    { method: 'POST', body: JSON.stringify(segment) },
    token
  )
}

export function listJobs(
  token: string,
  limit = 20,
  offset = 0
): Promise<{ jobs: Job[]; limit: number; offset: number }> {
  return apiFetch(`/jobs/?limit=${limit}&offset=${offset}`, {}, token)
}

// ── Services ──────────────────────────────────────────────────────────────────

export function estimateService(
  slug: string,
  formData: FormData,
  token: string
): Promise<EstimateResult> {
  return apiFetch<EstimateResult>(
    `/services/${slug}/estimate`,
    { method: 'POST', body: formData },
    token
  )
}

export function processService(
  slug: string,
  body: { job_id: string; confirmed: boolean; processing_config?: ProcessingConfig; zone_config?: unknown[] },
  token: string
): Promise<{ job_id: string; status: string }> {
  return apiFetch(
    `/services/${slug}/process`,
    { method: 'POST', body: JSON.stringify(body) },
    token
  )
}

export function getDetectionPreview(
  slug: string,
  body: { job_id: string; sample_fps?: number; confidence?: number; start_sec?: number; end_sec?: number },
  token: string
): Promise<DetectionPreviewResult> {
  return apiFetch<DetectionPreviewResult>(
    `/services/${slug}/detection-preview`,
    { method: 'POST', body: JSON.stringify(body) },
    token
  )
}

export function getDetectionAt(
  slug: string,
  body: { job_id: string; at_sec: number; confidence?: number },
  token: string
): Promise<DetectionAtResult> {
  return apiFetch<DetectionAtResult>(
    `/services/${slug}/detection-at`,
    { method: 'POST', body: JSON.stringify(body) },
    token
  )
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function listAdminUsers(
  token: string,
  limit = 20,
  offset = 0
): Promise<{ users: AdminUser[] }> {
  return apiFetch(`/admin/users?limit=${limit}&offset=${offset}`, {}, token)
}

export function banUser(token: string, userId: string, reason: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${userId}/ban`, { method: 'POST', body: JSON.stringify({ reason }) }, token)
}

export function unbanUser(token: string, userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${userId}/unban`, { method: 'POST', body: JSON.stringify({}) }, token)
}

export function adjustCredits(
  token: string,
  userId: string,
  amount: number,
  description: string
): Promise<{ ok: boolean; new_balance: number }> {
  return apiFetch(
    `/admin/users/${userId}/credits`,
    { method: 'POST', body: JSON.stringify({ amount, description }) },
    token
  )
}

export function listClaims(
  token: string,
  status = 'open',
  limit = 20,
  offset = 0
): Promise<{ claims: Claim[] }> {
  return apiFetch(`/admin/claims?status=${status}&limit=${limit}&offset=${offset}`, {}, token)
}

export function resolveClaim(
  token: string,
  claimId: string,
  action: string,
  adminNotes: string,
  creditsReturned = 0
): Promise<{ ok: boolean }> {
  return apiFetch(
    `/admin/claims/${claimId}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify({ action, admin_notes: adminNotes, credits_returned: creditsReturned }),
    },
    token
  )
}

export function listFailedJobs(token: string, limit = 20): Promise<{ jobs: Job[] }> {
  return apiFetch(`/admin/jobs/failed?limit=${limit}`, {}, token)
}
