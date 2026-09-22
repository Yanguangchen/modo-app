import { describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { ApiError } from './errors.js'
import { callerFromToken, requireAuth } from './auth.js'
import type { Caller } from './auth.js'

const mockVerifyIdToken = vi.fn()

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
  }),
}))

vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: vi.fn(),
}))

function makeContext(authHeader?: string): {
  ctx: Context<{ Variables: { caller: Caller } }>
  setMap: Map<string, unknown>
} {
  const setMap = new Map<string, unknown>()
  const ctx = {
    req: {
      header: (name: string) => {
        if (name.toLowerCase() === 'authorization') return authHeader
        return undefined
      },
    },
    set: (key: string, val: unknown) => {
      setMap.set(key, val)
    },
    get: (key: string) => setMap.get(key),
  } as unknown as Context<{ Variables: { caller: Caller } }>
  return { ctx, setMap }
}

describe('callerFromToken', () => {
  it('throws 403 when MFA is required but second factor is absent', () => {
    expect(() =>
      callerFromToken({ uid: 'u1', firebase: { sign_in_provider: 'password', identities: {} } }, true),
    ).toThrow(ApiError)
  })

  it('allows access when MFA is not required even without second factor', () => {
    const caller = callerFromToken(
      { uid: 'u1', email: 'dev@test.local', firebase: { sign_in_provider: 'password', identities: {} } },
      false,
    )
    expect(caller.uid).toBe('u1')
    expect(caller.email).toBe('dev@test.local')
    expect(caller.roles).toEqual([])
  })

  it('filters out non-string roles and extracts tenantId properly', () => {
    const caller = callerFromToken(
      {
        uid: 'u2',
        tenant_id: 'tenant-xyz',
        roles: ['admin', 123, null, 'editor'],
        firebase: { sign_in_provider: 'google.com', identities: {}, sign_in_second_factor: 'totp' },
      },
      true,
    )
    expect(caller.roles).toEqual(['admin', 'editor'])
    expect(caller.tenantId).toBe('tenant-xyz')
  })

  it('handles non-string tenantId by setting undefined', () => {
    const caller = callerFromToken(
      {
        uid: 'u3',
        tenant_id: 42 as unknown as string,
        firebase: { sign_in_provider: 'google.com', identities: {}, sign_in_second_factor: 'totp' },
      },
      true,
    )
    expect(caller.tenantId).toBeUndefined()
  })
})

describe('requireAuth middleware', () => {
  it('throws 401 when Authorization header is missing', async () => {
    const { ctx } = makeContext(undefined)
    const next = vi.fn().mockResolvedValue(undefined)

    await expect(requireAuth(ctx, next)).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('throws 401 when Authorization header does not start with Bearer', async () => {
    const { ctx } = makeContext('Basic dXNlcjpwYXNz')
    const next = vi.fn().mockResolvedValue(undefined)

    await expect(requireAuth(ctx, next)).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('throws 401 invalid_token when token verification fails', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token expired'))
    const { ctx } = makeContext('Bearer expired-token')
    const next = vi.fn().mockResolvedValue(undefined)

    await expect(requireAuth(ctx, next)).rejects.toMatchObject({
      status: 401,
      code: 'invalid_token',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('verifies token, attaches caller to context, and calls next on success', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'auth-user-99',
      email: 'user@example.com',
      firebase: { sign_in_provider: 'google.com', identities: {}, sign_in_second_factor: 'phone' },
    })

    const { ctx, setMap } = makeContext('Bearer valid-id-token')
    const next = vi.fn().mockResolvedValue(undefined)

    await requireAuth(ctx, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(setMap.get('caller')).toMatchObject({
      uid: 'auth-user-99',
      email: 'user@example.com',
    })
  })
})
