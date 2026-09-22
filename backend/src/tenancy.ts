import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import type { MiddlewareHandler } from 'hono'
import { audit } from './audit.js'
import type { Caller } from './auth.js'
import { config } from './config.js'
import { ApiError } from './errors.js'
import { adminApp, paths } from './firebase.js'

export type Role = 'member' | 'knowledge_owner' | 'admin'
export const SUPER_ROLES: Role[] = ['member', 'admin', 'knowledge_owner']

export type Member = Caller & { tenantId: string; email: string; roles: Role[]; teamId?: string }
export type MemberEnv = { Variables: { caller: Caller; member: Member } }

const seen = new Map<string, { member: Member; exp: number }>()

/** Resolves the caller's membership for every tenant-scoped route. */
export const requireMember: MiddlewareHandler<MemberEnv> = async (c, next) => {
  const caller = c.get('caller')
  if (!caller.tenantId) throw new ApiError(403, 'not_bootstrapped', 'Finish setting up your account, then try again.')
  const key = `${caller.tenantId}/${caller.uid}`
  let hit = seen.get(key)
  if (!hit || hit.exp < Date.now()) {
    const snap = await paths.user(caller.tenantId, caller.uid).get()
    if (!snap.exists || snap.data()?.removedAt) throw new ApiError(403, 'not_member', 'This account does not have access to the workspace.')
    const d = snap.data()!
    hit = { member: { ...caller, tenantId: caller.tenantId, email: (d.email as string) ?? caller.email ?? '', roles: (d.roles as Role[]) ?? ['member'], teamId: d.teamId as string | undefined }, exp: Date.now() + 60_000 }
    seen.set(key, hit)
  }
  c.set('member', hit.member)
  await next()
}

export const forgetMember = (tenantId: string, uid: string) => seen.delete(`${tenantId}/${uid}`)

export const requireRole = (...roles: Role[]): MiddlewareHandler<MemberEnv> => async (c, next) => {
  if (!roles.some(r => c.get('member').roles.includes(r))) throw new ApiError(403, 'forbidden', 'Your role cannot do this.')
  await next()
}

/** Who may join: invited emails, tenant admins, and bootstrap super-admins. */
export function admission(email: string, tenant: { invites?: string[]; admins?: string[] } | undefined, bootstrapAdmins: string[]): Role[] | null {
  const e = email.toLowerCase()
  if (bootstrapAdmins.includes(e) || tenant?.admins?.map(x => x.toLowerCase()).includes(e)) return SUPER_ROLES
  if (tenant?.invites?.map(x => x.toLowerCase()).includes(e)) return ['member']
  return null
}

/** POST /me/bootstrap — admit an invited user and stamp tenant and roles into their token claims. */
export async function bootstrap(caller: Caller & { emailVerified?: boolean }) {
  const email = (caller.email ?? '').toLowerCase()
  if (caller.tenantId) {
    const snap = await paths.user(caller.tenantId, caller.uid).get()
    if (snap.exists && !snap.data()?.removedAt) {
      const d = snap.data()!
      await snap.ref.update({ lastSeenAt: FieldValue.serverTimestamp() })
      return { tenantId: caller.tenantId, roles: d.roles as Role[], email: d.email as string, refreshToken: false }
    }
  }
  if (!email || caller.emailVerified === false) throw new ApiError(403, 'not_invited', 'This account is not invited to the workspace.')

  const tenantId = config.pilotTenantId
  const tenantSnap = await paths.tenant(tenantId).get()
  const roles = admission(email, tenantSnap.data() as { invites?: string[]; admins?: string[] } | undefined, config.bootstrapAdmins)
  if (!roles) {
    await audit(tenantId, { actor: caller.uid, action: 'user.bootstrap', result: 'denied', policy: 'not_invited' })
    throw new ApiError(403, 'not_invited', 'This account is not invited to the workspace. Ask an admin for an invite.')
  }

  if (!tenantSnap.exists) await paths.tenant(tenantId).set({ createdAt: FieldValue.serverTimestamp(), invites: [], admins: [] }, { merge: true })
  await paths.user(tenantId, caller.uid).set({
    email, roles, dataDomain: 'private',
    createdAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  await getAuth(adminApp()).setCustomUserClaims(caller.uid, { tenant_id: tenantId, roles })
  await audit(tenantId, { actor: caller.uid, action: 'user.bootstrap', objectId: caller.uid, result: 'ok', policy: roles.includes('admin') ? 'admin' : 'invite' })
  return { tenantId, roles, email, refreshToken: true }
}
