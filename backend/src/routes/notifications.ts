import { Hono } from 'hono'
import { z } from 'zod'
import { openFields, sealFields } from '../crypto.js'
import { ApiError } from '../errors.js'
import { ID_RE, paths } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'
import { body, id, now, scope } from './util.js'

const KINDS = ['reminder', 'system', 'decision'] as const
const PRIORITIES = ['low', 'normal', 'high'] as const
const SEALED = ['title', 'message'] as const

const Notification = z.object({
  id: z.string().regex(ID_RE).optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
  kind: z.enum(KINDS).default('reminder'),
  priority: z.enum(PRIORITIES).default('normal'),
  taskId: z.string().regex(ID_RE).optional(),
  blockId: z.string().regex(ID_RE).optional(),
})

export const notifications = new Hono<MemberEnv>()

notifications.get('/', async c => {
  const { t, u, key } = await scope(c)
  const snap = await paths.userCol(t, u, 'notifications').orderBy('createdAt', 'desc').limit(200).get()
  return c.json({ notifications: snap.docs.map(d => openFields(key, { ...d.data(), id: d.id }, SEALED)) })
})

notifications.post('/', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Notification)
  const ref = b.id ? paths.userCol(t, u, 'notifications').doc(b.id) : paths.userCol(t, u, 'notifications').doc()
  const doc = { ...b, id: ref.id, ownerId: u, dataDomain: 'private', read: false, createdAt: now(), updatedAt: now() }
  await ref.create(sealFields(key, doc, SEALED)).catch(() => { throw new ApiError(422, 'exists', 'That notification already exists.') })
  return c.json({ notification: doc }, 201)
})

notifications.post('/:id/read', async c => {
  const { t, u } = await scope(c)
  const ref = paths.userCol(t, u, 'notifications').doc(id(c))
  if (!(await ref.get()).exists) throw new ApiError(404, 'not_found', 'That notification no longer exists.')
  await ref.update({ read: true, updatedAt: now() })
  return c.json({ ok: true })
})

notifications.delete('/read', async c => {
  const { t, u } = await scope(c)
  const snap = await paths.userCol(t, u, 'notifications').where('read', '==', true).limit(200).get()
  await Promise.all(snap.docs.map(d => d.ref.delete()))
  return c.json({ ok: true, deleted: snap.size })
})
