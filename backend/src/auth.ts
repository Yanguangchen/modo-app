import { getAuth } from 'firebase-admin/auth'
import type { DecodedIdToken } from 'firebase-admin/auth'
import type { MiddlewareHandler } from 'hono'
import { ApiError } from './errors.js'
import { adminApp } from './firebase.js'

function auth() {
  return getAuth(adminApp())
}

export type Caller = { uid: string; email?: string; emailVerified?: boolean; tenantId?: string; roles: string[] }

/** Reads identity and claims from a verified token. Sign-in is Google only; there is no second factor. */
export function callerFromToken(token: Pick<DecodedIdToken, 'uid' | 'email' | 'firebase'> & Record<string, unknown>): Caller {
  const roles = Array.isArray(token.roles) ? (token.roles as unknown[]).filter((r): r is string => typeof r === 'string') : []
  return { uid: token.uid, email: token.email, emailVerified: typeof token.email_verified === 'boolean' ? token.email_verified : undefined, tenantId: typeof token.tenant_id === 'string' ? token.tenant_id : undefined, roles }
}

/** Verifies `Authorization: Bearer <Firebase ID token>` and attaches the caller. */
export const requireAuth: MiddlewareHandler<{ Variables: { caller: Caller } }> = async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ApiError(401, 'unauthenticated', 'Sign in to use AI features.')
  let decoded: DecodedIdToken
  try {
    decoded = await auth().verifyIdToken(token)
  } catch {
    throw new ApiError(401, 'invalid_token', 'Your session has expired. Sign in again.')
  }
  c.set('caller', callerFromToken(decoded))
  await next()
}
