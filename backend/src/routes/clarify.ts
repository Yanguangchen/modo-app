import { Hono } from 'hono'
import { z } from 'zod'
import type { Generate } from '../ai.js'
import { audit } from '../audit.js'
import { open, seal } from '../crypto.js'
import { ApiError } from '../errors.js'
import { paths } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'
import { TransformRequest, transform } from '../transform.js'
import { body, id, now, scope } from './util.js'

const SourceIn = z.object({ text: z.string().trim().min(1).max(8000), type: z.enum(['typed', 'pasted', 'upload']).default('typed') })

export function clarifyRoutes(generate: Generate) {
  const r = new Hono<MemberEnv>()

  /** Originals are immutable once stored (COM01, COM03). */
  r.post('/sources', async c => {
    const { t, u, key } = await scope(c)
    const b = await body(c, SourceIn)
    const ref = paths.userCol(t, u, 'sources').doc()
    await ref.create({ content: seal(key, b.text), type: b.type, ownerId: u, dataDomain: 'private', sensitivity: 'private', createdAt: now() })
    return c.json({ id: ref.id }, 201)
  })

  r.get('/sources/:id', async c => {
    const { t, u, key } = await scope(c)
    const snap = await paths.userCol(t, u, 'sources').doc(id(c)).get()
    if (!snap.exists) throw new ApiError(404, 'not_found', 'Not found.')
    return c.json({ id: snap.id, text: open(key, snap.data()!.content), type: snap.data()!.type, createdAt: snap.data()!.createdAt })
  })

  r.post('/transformations', async c => {
    const { t, u, key } = await scope(c)
    const raw = await c.req.json().catch(() => undefined) as Record<string, unknown> | undefined
    let sourceId = typeof raw?.sourceId === 'string' ? raw.sourceId : undefined
    let text = typeof raw?.text === 'string' ? raw.text : undefined
    if (sourceId) {
      const s = await paths.userCol(t, u, 'sources').doc(sourceId).get()
      if (!s.exists) throw new ApiError(404, 'not_found', 'That source no longer exists.')
      text = open(key, s.data()!.content)
    }
    const parsed = TransformRequest.safeParse({ ...raw, text })
    if (!parsed.success) throw new ApiError(422, 'invalid_request', 'Something in the request was missing or too long.')
    if (!sourceId) {
      const ref = paths.userCol(t, u, 'sources').doc()
      await ref.create({ content: seal(key, parsed.data.text), type: 'typed', ownerId: u, dataDomain: 'private', sensitivity: 'private', createdAt: now() })
      sourceId = ref.id
    }
    const out = await transform(parsed.data, generate)
    const ref = paths.userCol(t, u, 'transformations').doc()
    const record = { sourceId, ...out.meta, status: 'draft', version: 1, ownerId: u, dataDomain: 'private', createdAt: now(), updatedAt: now() }
    await ref.create({ ...record, output: seal(key, JSON.stringify(out.result)) })
    await ref.collection('versions').doc('1').create({ n: 1, output: seal(key, JSON.stringify(out.result)), at: now(), by: 'model' })
    return c.json({ id: ref.id, sourceId, result: out.result, meta: out.meta }, 201)
  })

  const load = async (c: Parameters<typeof scope>[0]) => {
    const s = await scope(c)
    const ref = paths.userCol(s.t, s.u, 'transformations').doc(id(c))
    const snap = await ref.get()
    if (!snap.exists) throw new ApiError(404, 'not_found', 'Not found.')
    return { ...s, ref, data: snap.data()! }
  }

  r.get('/transformations/:id', async c => {
    const { key, ref, data } = await load(c)
    const versions = await ref.collection('versions').orderBy('n').get()
    const { output, ...meta } = data
    return c.json({ id: ref.id, ...meta, result: JSON.parse(open(key, output)), versions: versions.docs.map(v => ({ n: v.data().n, at: v.data().at, by: v.data().by })) })
  })

  /** User edits become a new version; earlier versions stay restorable (COM09). */
  r.patch('/transformations/:id', async c => {
    const { key, ref, data } = await load(c)
    const b = await body(c, z.object({ result: z.record(z.string(), z.unknown()), status: z.enum(['draft', 'accepted']).optional() }))
    const json = JSON.stringify(b.result)
    if (json.length > 100_000) throw new ApiError(413, 'too_large', 'That result is too large.')
    const n = (data.version as number) + 1
    await ref.collection('versions').doc(String(n)).create({ n, output: seal(key, json), at: now(), by: 'user' })
    await ref.update({ output: seal(key, json), version: n, status: b.status ?? data.status, updatedAt: now() })
    return c.json({ version: n })
  })

  r.post('/transformations/:id/restore', async c => {
    const { key, ref, data } = await load(c)
    const b = await body(c, z.object({ version: z.number().int().min(1) }))
    const v = await ref.collection('versions').doc(String(b.version)).get()
    if (!v.exists) throw new ApiError(404, 'not_found', 'That version no longer exists.')
    const n = (data.version as number) + 1
    await ref.collection('versions').doc(String(n)).create({ n, output: v.data()!.output, at: now(), by: 'restore', from: b.version })
    await ref.update({ output: v.data()!.output, version: n, updatedAt: now() })
    return c.json({ version: n, result: JSON.parse(open(key, v.data()!.output)) })
  })

  /** Report without copying the body anywhere else (COM report, PRV08). */
  r.post('/transformations/:id/report', async c => {
    const { t, u, ref } = await load(c)
    const b = await body(c, z.object({ reason: z.enum(['harmful', 'inaccurate', 'unhelpful']) }))
    await ref.update({ status: 'reported', reportReason: b.reason, updatedAt: now() })
    await audit(t, { actor: u, action: 'transformation.report', objectId: ref.id, result: 'ok', policy: b.reason })
    return c.json({ ok: true })
  })

  return r
}
