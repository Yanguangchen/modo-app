import { Hono } from 'hono'
import { z } from 'zod'
import { audit } from '../audit.js'
import { ApiError } from '../errors.js'
import { paths } from '../firebase.js'
import type { Article } from '../knowledge.js'
import { forgetKnowledge, publishedArticles, retrieve } from '../knowledge.js'
import { requireRole } from '../tenancy.js'
import type { MemberEnv } from '../tenancy.js'
import { body, id, now, requireConfirm } from './util.js'

const meta = ({ body: _b, ...m }: Article) => m

const ArticleIn = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500),
  body: z.string().max(20_000),
  owner: z.string().max(120),
  source: z.string().max(200),
  tags: z.array(z.string().max(40)).max(20).default([]),
  nextReview: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const knowledge = new Hono<MemberEnv>()

/** Published articles only: title, owner, source, version, review dates (GUI05). */
knowledge.get('/', async c => {
  const t = c.get('member').tenantId
  const q = (c.req.query('q') ?? '').trim()
  const all = await publishedArticles(t)
  const list = q ? retrieve(q, all, 20) : all
  return c.json({ articles: list.map(meta) })
})

knowledge.get('/review', requireRole('knowledge_owner', 'admin'), async c => {
  const m = c.get('member')
  const snap = await paths.knowledge(m.tenantId).get()
  const mine = snap.docs.map(d => ({ ...(d.data() as Article), id: d.id }))
    .filter(a => m.roles.includes('admin') || (a as Article & { ownerUid?: string }).ownerUid === m.uid)
  return c.json({ articles: mine.map(meta) })
})

knowledge.get('/:id', async c => {
  const t = c.get('member').tenantId
  const snap = await paths.knowledge(t).doc(id(c)).get()
  if (!snap.exists || snap.data()?.state !== 'published') throw new ApiError(404, 'not_found', 'Not found.')
  return c.json({ article: { ...snap.data(), id: snap.id } })
})

knowledge.post('/', requireRole('knowledge_owner', 'admin'), async c => {
  const m = c.get('member')
  const b = await body(c, ArticleIn)
  const ref = paths.knowledge(m.tenantId).doc()
  await ref.create({ ...b, ownerUid: m.uid, state: 'draft', version: 'v0', lastReviewed: now().slice(0, 10), dataDomain: 'published', createdAt: now(), updatedAt: now() })
  return c.json({ id: ref.id }, 201)
})

knowledge.patch('/:id', requireRole('knowledge_owner', 'admin'), async c => {
  const m = c.get('member')
  const ref = paths.knowledge(m.tenantId).doc(id(c))
  const snap = await ref.get()
  if (!snap.exists) throw new ApiError(404, 'not_found', 'Not found.')
  if (!m.roles.includes('admin') && snap.data()?.ownerUid !== m.uid) throw new ApiError(403, 'forbidden', 'Only the article owner can change it.')
  const b = await body(c, ArticleIn.partial().extend({ state: z.enum(['draft', 'published']).optional(), confirm: z.boolean().optional() }))
  const { state, confirm, ...fields } = b
  const update: Record<string, unknown> = { ...fields, updatedAt: now() }
  if (state && state !== snap.data()?.state) {
    requireConfirm({ confirm })
    update.state = state
    if (state === 'published') {
      const n = Number(String(snap.data()?.version ?? 'v0').replace(/^v/, '').split('.')[0]) + 1
      update.version = `v${n}.0`
      update.lastReviewed = now().slice(0, 10)
    }
    await audit(m.tenantId, { actor: m.uid, action: state === 'published' ? 'knowledge.publish' : 'knowledge.unpublish', objectId: ref.id, destination: 'organization', result: 'ok' })
  }
  await ref.update(update)
  forgetKnowledge(m.tenantId)
  return c.json({ ok: true, version: update.version ?? snap.data()?.version })
})
