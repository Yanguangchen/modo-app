import type { Context } from 'hono'
import type { z } from 'zod'
import { userKey } from '../crypto.js'
import { ApiError } from '../errors.js'
import { ID_RE } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'

export async function body<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  const r = schema.safeParse(await c.req.json().catch(() => undefined))
  if (!r.success) throw new ApiError(422, 'invalid_request', 'Something in the request was missing, too long, or in the wrong format.')
  return r.data
}

export function id(c: Context, name = 'id') {
  const v = c.req.param(name) ?? ''
  if (!ID_RE.test(v)) throw new ApiError(404, 'not_found', 'Not found.')
  return v
}

/** Tenant, user, and the user's data key for sealing private bodies. */
export async function scope(c: Context<MemberEnv>) {
  const m = c.get('member')
  return { t: m.tenantId, u: m.uid, member: m, key: await userKey(m.tenantId, m.uid) }
}

/** Sensitive actions must carry an explicit confirmation (REQUIREMENTS §7.8). */
export function requireConfirm(b: { confirm?: boolean }) {
  if (b.confirm !== true) throw new ApiError(422, 'confirmation_required', 'Please confirm this action first.')
}

export const now = () => new Date().toISOString()
