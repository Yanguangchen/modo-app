import type { MiddlewareHandler } from 'hono'
import type { Caller } from './auth.js'
import { ApiError } from './errors.js'

/** Per-user sliding window. Protects model quota; one Cloud Run instance keeps its own window. */
export function rateLimit(limit: number, windowMs: number): MiddlewareHandler<{ Variables: { caller: Caller } }> {
  const hits = new Map<string, number[]>()
  return async (c, next) => {
    const uid = c.get('caller').uid
    const now = Date.now()
    const recent = (hits.get(uid) ?? []).filter(t => now - t < windowMs)
    if (recent.length >= limit) throw new ApiError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.')
    recent.push(now)
    hits.set(uid, recent)
    await next()
  }
}
