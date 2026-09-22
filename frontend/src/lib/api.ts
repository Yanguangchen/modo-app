import { auth } from './firebase'

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message) }
}

const fromEnv = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const pointsAtLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)

/** Local dev keeps localhost:3001. A production build always calls this site's own /v1 API. */
function apiBase() {
  if (import.meta.env.PROD && pointsAtLoopback) return ''
  if (typeof window === 'undefined') return fromEnv
  const pageIsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!pageIsLocal && pointsAtLoopback) return ''
  return fromEnv
}

const base = apiBase()

/** POST JSON to the Cloud Run API with the caller's Firebase ID token. */
export const apiPost = <T>(path: string, body: unknown, timeoutMs = 20000) => api<T>('POST', path, body, timeoutMs)

/** Any method against the Cloud Run API, authenticated with the caller's Firebase ID token. */
export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const user = auth?.currentUser
  if (!user) throw new ApiError('unauthenticated', 'Sign in to use AI features.', 401)
  const token = await user.getIdToken()
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({})) as { code?: string; message?: string }
    if (!res.ok) throw new ApiError(data.code ?? 'http_error', data.message ?? 'Something went wrong. Try again.', res.status)
    return data as T
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (controller.signal.aborted) throw new ApiError('timeout', 'The AI took too long. Try again.')
    throw new ApiError('network', 'Could not reach the AI service. Check your connection and try again.')
  } finally {
    window.clearTimeout(timer)
  }
}

export const aiDemoMode = (flag: string | undefined) => flag !== 'false'
