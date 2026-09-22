import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { ApiError } from './errors.js'
import { rateLimit } from './rateLimit.js'
import type { Caller } from './auth.js'

function makeContext(uid: string): Context<{ Variables: { caller: Caller } }> {
  const store = new Map<string, unknown>([['caller', { uid, roles: [] }]])
  return {
    get: (key: string) => store.get(key),
    set: (key: string, val: unknown) => store.set(key, val),
  } as unknown as Context<{ Variables: { caller: Caller } }>
}

describe('rateLimit', () => {
  it('allows requests within limit and tracks sliding window', async () => {
    const middleware = rateLimit(3, 1000)
    const ctx = makeContext('user-1')
    const next = vi.fn().mockResolvedValue(undefined)

    // 1st request
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)

    // 2nd request
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledTimes(2)

    // 3rd request
    await middleware(ctx, next)
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('throws 429 ApiError when limit is exceeded within the window', async () => {
    const middleware = rateLimit(2, 5000)
    const ctx = makeContext('user-limited')
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware(ctx, next)
    await middleware(ctx, next)

    await expect(middleware(ctx, next)).rejects.toThrow(ApiError)
    await expect(middleware(ctx, next)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    })
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('prunes expired timestamps outside the window', async () => {
    vi.useFakeTimers()
    try {
      const middleware = rateLimit(2, 1000)
      const ctx = makeContext('user-expire')
      const next = vi.fn().mockResolvedValue(undefined)

      await middleware(ctx, next)
      await middleware(ctx, next)

      // 3rd immediately should fail
      await expect(middleware(ctx, next)).rejects.toThrow(ApiError)

      // Advance time beyond the 1000ms window
      vi.advanceTimersByTime(1100)

      // Should now succeed
      await middleware(ctx, next)
      expect(next).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('isolates counters between different users', async () => {
    const middleware = rateLimit(1, 1000)
    const ctxA = makeContext('user-A')
    const ctxB = makeContext('user-B')
    const next = vi.fn().mockResolvedValue(undefined)

    await middleware(ctxA, next)
    // user-A is now limited
    await expect(middleware(ctxA, next)).rejects.toThrow(ApiError)

    // user-B should still be permitted
    await middleware(ctxB, next)
    expect(next).toHaveBeenCalledTimes(2)
  })
})
