import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { Hono } from 'hono'
import { z } from 'zod'
import { audit, verifyChain } from '../audit.js'
import { ApiError } from '../errors.js'
import { adminApp, paths } from '../firebase.js'
import { forgetMember, requireRole } from '../tenancy.js'
import type { MemberEnv, Role } from '../tenancy.js'
import { body, id, now, requireConfirm } from './util.js'

export const MIN_COHORT = 5

/** Admin routes. None of them can read private content: no sources, tasks, notes, or guide values. */
export const admin = new Hono<MemberEnv>()
admin.use('*', requireRole('admin'))

admin.get('/users', async c => {
  const t = c.get('member').tenantId
  const snap = await paths.users(t).get()
  return c.json({ users: snap.docs.map(d => ({ uid: d.id, email: d.data().email, roles: d.data().roles, teamId: d.data().teamId ?? null, removed: !!d.data().removedAt })) })
})

admin.get('/invites', async c => {
  const d = (await paths.tenant(c.get('member').tenantId).get()).data() ?? {}
  return c.json({ invites: d.invites ?? [], admins: d.admins ?? [] })
})

admin.post('/invites', async c => {
  const m = c.get('member')
  const b = await body(c, z.object({ emails: z.array(z.string().email().max(200)).min(1).max(200), confirm: z.boolean() }))
  requireConfirm(b)
  const emails = b.emails.map(e => e.toLowerCase())
  await paths.tenant(m.tenantId).set({ invites: FieldValue.arrayUnion(...emails) }, { merge: true })
  await audit(m.tenantId, { actor: m.uid, action: 'admin.invite', destination: `${emails.length} emails`, result: 'ok' })
  return c.json({ invited: emails.length })
})

admin.delete('/invites', async c => {
  const m = c.get('member')
  const b = await body(c, z.object({ emails: z.array(z.string().email()).min(1).max(200), confirm: z.boolean() }))
  requireConfirm(b)
  await paths.tenant(m.tenantId).set({ invites: FieldValue.arrayRemove(...b.emails.map(e => e.toLowerCase())) }, { merge: true })
  await audit(m.tenantId, { actor: m.uid, action: 'admin.uninvite', destination: `${b.emails.length} emails`, result: 'ok' })
  return c.json({ ok: true })
})

admin.put('/users/:uid', async c => {
  const m = c.get('member')
  const uid = id(c, 'uid')
  const b = await body(c, z.object({
    roles: z.array(z.enum(['member', 'knowledge_owner', 'admin'])).min(1).optional(),
    teamId: z.string().max(64).nullable().optional(),
    confirm: z.boolean(),
  }))
  requireConfirm(b)
  const ref = paths.user(m.tenantId, uid)
  if (!(await ref.get()).exists) throw new ApiError(404, 'not_found', 'Not found.')
  if (uid === m.uid && b.roles && !b.roles.includes('admin')) throw new ApiError(422, 'self_demote', 'You cannot remove your own admin role.')
  const update: Record<string, unknown> = { updatedAt: now() }
  if (b.roles) {
    const roles: Role[] = b.roles.includes('member') ? b.roles : ['member', ...b.roles]
    update.roles = roles
    await getAuth(adminApp()).setCustomUserClaims(uid, { tenant_id: m.tenantId, roles })
  }
  if (b.teamId !== undefined) update.teamId = b.teamId
  await ref.update(update)
  forgetMember(m.tenantId, uid)
  await audit(m.tenantId, { actor: m.uid, action: 'admin.update_user', objectId: uid, destination: b.roles?.join('+'), result: 'ok' })
  return c.json({ ok: true })
})

/** Aggregate counts only, suppressed below the minimum cohort (REQUIREMENTS §8). */
admin.get('/metrics', async c => {
  const t = c.get('member').tenantId
  const users = (await paths.users(t).get()).docs.filter(d => !d.data().removedAt)
  const weekAgo = Date.now() - 7 * 86_400_000
  const active = users.filter(d => {
    const at = d.data().lastSeenAt
    const ms = at?.toMillis ? at.toMillis() : Date.parse(at ?? '')
    return ms > weekAgo
  }).length
  const out: Record<string, number | null> = { members: users.length >= MIN_COHORT ? users.length : null }
  out.weeklyActive = active >= MIN_COHORT ? active : null
  let sharing = 0
  for (const u of users) {
    const s = await paths.guideSnapshots(t, u.id).where('revokedAt', '==', null).limit(1).get()
    if (!s.empty) sharing++
  }
  out.sharingAGuide = sharing >= MIN_COHORT ? sharing : null
  return c.json({ minCohort: MIN_COHORT, metrics: out, note: 'Values under the minimum cohort are withheld.' })
})

admin.get('/audit', async c => {
  const t = c.get('member').tenantId
  const limit = Math.min(200, Number(c.req.query('limit') ?? 100) || 100)
  const snap = await paths.audit(t).orderBy('seq', 'desc').limit(limit).get()
  const events = snap.docs.map(d => { const { createdAt: _c, ...e } = d.data(); return { id: d.id, ...e } as unknown as { seq: number; prevHash: string; hash: string } })
  return c.json({ events, chainIntact: verifyChain(events) })
})
