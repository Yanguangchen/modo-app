import { Hono } from 'hono'
import { OAuth2Client } from 'google-auth-library'
import { audit } from '../audit.js'
import { config } from '../config.js'
import { ApiError } from '../errors.js'
import { db, paths } from '../firebase.js'
import { log } from '../log.js'

const oauth = new OAuth2Client()

/** Only Cloud Scheduler's service account, proven by a Google-signed OIDC token (REQUIREMENTS §7.9). */
export const internal = new Hono()

internal.use('*', async (c, next) => {
  const token = (c.req.header('authorization') ?? '').replace(/^Bearer /, '')
  if (!token || !config.retention.invoker) throw new ApiError(403, 'forbidden', 'Forbidden.')
  try {
    const ticket = await oauth.verifyIdToken({ idToken: token, audience: config.apiPublicUrl || undefined })
    const p = ticket.getPayload()
    if (!p?.email_verified || p.email !== config.retention.invoker) throw new Error('wrong caller')
  } catch {
    throw new ApiError(403, 'forbidden', 'Forbidden.')
  }
  await next()
})

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

internal.post('/retention', async c => {
  const tenants = await db().collection('tenants').get()
  let removedUsers = 0, snapshots = 0, auditEvents = 0
  for (const t of tenants.docs) {
    // Users who deleted their data or left: purge what remains after the private window.
    const gone = await paths.users(t.id).where('removedAt', '<', cutoff(config.retention.privateDays)).get()
    for (const u of gone.docs) { await db().recursiveDelete(u.ref); removedUsers++ }
    // Revoked shared snapshots after the shared window.
    const revoked = await db().collectionGroup('snapshots').where('revokedAt', '<', cutoff(config.retention.sharedDays)).get()
    for (const s of revoked.docs.filter(d => d.ref.path.startsWith(`tenants/${t.id}/`))) { await s.ref.delete(); snapshots++ }
    // Audit events past their window.
    const old = await paths.audit(t.id).where('at', '<', cutoff(config.retention.auditDays)).limit(500).get()
    for (const e of old.docs) { await e.ref.delete(); auditEvents++ }
    await audit(t.id, { actor: 'system:retention', action: 'retention.run', result: 'ok', destination: `users:${removedUsers},snapshots:${snapshots},audit:${auditEvents}` })
  }
  log('INFO', 'retention', { users: removedUsers, snapshots, audit: auditEvents })
  return c.json({ removedUsers, snapshots, auditEvents })
})
