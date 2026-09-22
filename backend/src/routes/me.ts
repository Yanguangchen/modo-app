import { getAuth } from 'firebase-admin/auth'
import { Hono } from 'hono'
import { z } from 'zod'
import { audit } from '../audit.js'
import { forgetKey, openFields } from '../crypto.js'
import { adminApp, db, paths } from '../firebase.js'
import { forgetMember } from '../tenancy.js'
import type { MemberEnv } from '../tenancy.js'
import { body, now, requireConfirm, scope } from './util.js'

const Preferences = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  motion: z.enum(['system', 'reduced', 'full']),
  solidSurfaces: z.boolean(),
  density: z.enum(['comfortable', 'compact']),
  textScale: z.number().min(0.8).max(1.6),
  font: z.enum(['system', 'atkinson']),
  todayView: z.string().max(20),
  bufferMinutes: z.number().int().min(0).max(120),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
  summaryFirst: z.boolean(),
  soundEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  durationLearning: z.boolean(),
}).partial()

export const me = new Hono<MemberEnv>()

me.get('/', c => {
  const m = c.get('member')
  return c.json({ uid: m.uid, email: m.email, tenantId: m.tenantId, roles: m.roles })
})

me.get('/preferences', async c => {
  const { t, u } = await scope(c)
  return c.json({ preferences: ((await paths.user(t, u).get()).data()?.preferences as object) ?? {} })
})

me.put('/preferences', async c => {
  const { t, u } = await scope(c)
  const prefs = await body(c, Preferences)
  await paths.user(t, u).set({ preferences: prefs, updatedAt: now() }, { merge: true })
  return c.json({ ok: true })
})

/** Everything the caller owns, decrypted, as one JSON archive (PRV09). */
me.post('/export', async c => {
  const { t, u, key } = await scope(c)
  const col = async (name: 'sources' | 'transformations' | 'tasks' | 'meetings') => (await paths.userCol(t, u, name).get()).docs.map(d => ({ id: d.id, ...d.data() }))
  const sealedAll = (rows: Record<string, unknown>[], fields: string[]) => rows.map(r => openFields(key, r, fields))
  const guide = (await paths.guideFields(t, u).get()).docs.map(d => openFields(key, { id: d.id, ...d.data() }, ['value']))
  const snapshots = (await paths.guideSnapshots(t, u).get()).docs.map(d => ({ id: d.id, ...d.data() }))
  await audit(t, { actor: u, action: 'user.export', objectId: u, result: 'ok' })
  return c.json({
    exportedAt: now(),
    profile: (await paths.user(t, u).get()).data(),
    sources: sealedAll(await col('sources'), ['content']),
    transformations: sealedAll(await col('transformations'), ['output']),
    tasks: sealedAll(await col('tasks'), ['title', 'why', 'doneWhen', 'resumeNote', 'source']),
    meetings: sealedAll(await col('meetings'), MEETING_SEALED),
    workingGuide: guide,
    sharedSnapshots: snapshots,
  })
})

/** Delete the caller's private content and keys. Audit history is kept per retention policy. */
me.delete('/data', async c => {
  const { t, u } = await scope(c)
  requireConfirm(await body(c, z.object({ confirm: z.boolean() })))
  for (const name of ['sources', 'transformations', 'tasks', 'meetings', 'secrets'] as const) {
    await db().recursiveDelete(paths.userCol(t, u, name))
  }
  await db().recursiveDelete(paths.guideFields(t, u))
  const snaps = await paths.guideSnapshots(t, u).get()
  await Promise.all(snaps.docs.map(d => d.ref.update({ revokedAt: now(), fields: [] })))
  await paths.user(t, u).set({ removedAt: now(), preferences: {} }, { merge: true })
  forgetKey(t, u); forgetMember(t, u)
  await getAuth(adminApp()).setCustomUserClaims(u, null)
  await audit(t, { actor: u, action: 'user.delete_data', objectId: u, result: 'ok' })
  return c.json({ ok: true })
})

export const MEETING_SEALED = ['title', 'organizer', 'purpose', 'outcome', 'role', 'contribution', 'decisionOwner', 'materials', 'prep', 'privateNotes', 'decisions', 'actions', 'questions', 'parkingLot']
