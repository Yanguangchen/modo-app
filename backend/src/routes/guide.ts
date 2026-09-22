import { Hono } from 'hono'
import { z } from 'zod'
import { audit } from '../audit.js'
import { openFields, sealFields } from '../crypto.js'
import { ApiError } from '../errors.js'
import { db, paths } from '../firebase.js'
import type { Member, MemberEnv } from '../tenancy.js'
import { body, id, now, requireConfirm, scope } from './util.js'

export const AUDIENCES = ['private', 'selected', 'team', 'organization'] as const
export type Audience = (typeof AUDIENCES)[number]
export type Viewer = 'selected' | 'team' | 'organization'
type Field = { id: string; label: string; hint?: string; value: string; audience: Audience; order?: number }

/** Which audiences a viewer relationship can see. `selected` viewers are usually teammates too. */
export function visibleTo(audience: Audience, viewer: { selected: boolean; team: boolean }) {
  if (audience === 'organization') return true
  if (audience === 'team') return viewer.team
  if (audience === 'selected') return viewer.selected
  return false
}

const FieldIn = z.object({
  label: z.string().trim().min(1).max(120),
  hint: z.string().max(300).optional(),
  value: z.string().max(2000),
  audience: z.enum(AUDIENCES),
  order: z.number().int().min(0).max(100).optional(),
})

export async function ownFields(t: string, u: string, key: Buffer): Promise<Field[]> {
  const snap = await paths.guideFields(t, u).get()
  return snap.docs
    .map(d => openFields(key, { ...(d.data() as Field), id: d.id }, ['value']))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export const guide = new Hono<MemberEnv>()

guide.get('/fields', async c => {
  const { t, u, key } = await scope(c)
  return c.json({ fields: await ownFields(t, u, key) })
})

guide.get('/fields/:fieldId', async c => {
  const { t, u, key } = await scope(c)
  const snap = await paths.guideFields(t, u).doc(id(c, 'fieldId')).get()
  if (!snap.exists) throw new ApiError(404, 'not_found', 'Not found.')
  return c.json({ field: openFields(key, { ...(snap.data() as Field), id: snap.id }, ['value']) })
})

guide.put('/fields/:fieldId', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, FieldIn)
  // Editing a field never shares it; sharing publishes a previewed snapshot.
  await paths.guideFields(t, u).doc(id(c, 'fieldId')).set({ ...sealFields(key, b, ['value']), ownerId: u, dataDomain: 'private', updatedAt: now() })
  return c.json({ ok: true })
})

const Preview = z.object({ as: z.enum(['selected', 'team', 'organization']) })
const relation = (as: Viewer) => ({ selected: as === 'selected', team: as !== 'organization' })

/** Exactly what a viewer relationship would receive, built on the server (REQUIREMENTS §7.4). */
guide.post('/preview', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Preview)
  const fields = (await ownFields(t, u, key)).filter(f => f.value.trim() && visibleTo(f.audience, relation(b.as)))
  return c.json({ as: b.as, fields: fields.map(f => ({ id: f.id, label: f.label, value: f.value })) })
})

const Share = z.object({
  confirm: z.boolean(),
  /** Emails of people in the "selected" audience. */
  selected: z.array(z.string().email().max(200)).max(50).default([]),
})

guide.post('/share', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Share)
  requireConfirm(b)
  const fields = (await ownFields(t, u, key)).filter(f => f.value.trim() && f.audience !== 'private')
  const col = paths.guideSnapshots(t, u)
  const version = await db().runTransaction(async tx => {
    const active = await tx.get(col.where('revokedAt', '==', null))
    const latest = await tx.get(col.orderBy('version', 'desc').limit(1))
    const v = ((latest.docs[0]?.data().version as number | undefined) ?? 0) + 1
    active.docs.forEach(d => tx.update(d.ref, { revokedAt: now(), supersededBy: v }))
    tx.create(col.doc(`v${v}`), {
      version: v, ownerId: u, dataDomain: 'shared', createdAt: now(), revokedAt: null,
      selected: b.selected.map(e => e.toLowerCase()),
      // Shared snapshots are readable by their audience, so values are stored as shared, not sealed.
      fields: fields.map(f => ({ id: f.id, label: f.label, value: f.value, audience: f.audience })),
    })
    return v
  })
  await audit(t, { actor: u, action: 'guide.share', objectId: `v${version}`, destination: summarize(fields), result: 'ok' })
  return c.json({ version, sharedFields: fields.length })
})

guide.post('/revoke', async c => {
  const { t, u } = await scope(c)
  requireConfirm(await body(c, z.object({ confirm: z.boolean() })))
  const active = await paths.guideSnapshots(t, u).where('revokedAt', '==', null).get()
  await Promise.all(active.docs.map(d => d.ref.update({ revokedAt: now() })))
  await audit(t, { actor: u, action: 'guide.revoke', objectId: active.docs[0]?.id, result: 'ok' })
  return c.json({ revoked: active.size })
})

guide.get('/status', async c => {
  const { t, u } = await scope(c)
  const active = await paths.guideSnapshots(t, u).where('revokedAt', '==', null).limit(1).get()
  const d = active.docs[0]?.data()
  return c.json({ shared: !!d, version: d?.version ?? null, sharedAt: d?.createdAt ?? null, selected: d?.selected ?? [] })
})

/** Fields of another person's current shared snapshot that the caller may see. */
guide.get('/shared/:userId', async c => {
  const me = c.get('member')
  const owner = id(c, 'userId')
  if (owner === me.uid) throw new ApiError(422, 'use_preview', 'Use preview to see your own guide.')
  const ownerSnap = await paths.user(me.tenantId, owner).get()
  if (!ownerSnap.exists || ownerSnap.data()?.removedAt) throw new ApiError(404, 'not_found', 'Not found.')
  const active = await paths.guideSnapshots(me.tenantId, owner).where('revokedAt', '==', null).limit(1).get()
  const snap = active.docs[0]?.data()
  if (!snap) return c.json({ fields: [] })
  const rel = viewerRelation(me, ownerSnap.data()?.teamId as string | undefined, snap.selected as string[])
  const fields = (snap.fields as Field[]).filter(f => visibleTo(f.audience, rel)).map(f => ({ label: f.label, value: f.value }))
  return c.json({ version: snap.version, fields })
})

export function viewerRelation(viewer: Pick<Member, 'email' | 'teamId'>, ownerTeamId: string | undefined, selected: string[]) {
  return {
    selected: selected.includes((viewer.email ?? '').toLowerCase()),
    team: !!viewer.teamId && viewer.teamId === ownerTeamId,
  }
}

const summarize = (fields: Field[]) => {
  const n = (a: Audience) => fields.filter(f => f.audience === a).length
  return `selected:${n('selected')},team:${n('team')},organization:${n('organization')}`
}

