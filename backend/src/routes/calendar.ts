import { Hono } from 'hono'
import { z } from 'zod'
import { openFields, sealFields } from '../crypto.js'
import { ApiError } from '../errors.js'
import { ID_RE, paths } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'
import { body, id, now, scope } from './util.js'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const BLOCK_KINDS = ['meeting', 'focus', 'break', 'buffer'] as const
const SEALED = ['title'] as const

const Block = z.object({
  id: z.string().regex(ID_RE).optional(),
  title: z.string().trim().min(1).max(300),
  date: yyyyMmDd,
  start: hhmm,
  end: hhmm,
  kind: z.enum(BLOCK_KINDS),
  meetingId: z.string().regex(ID_RE).optional(),
})

const Patch = Block.partial().omit({ id: true })

export const calendar = new Hono<MemberEnv>()

calendar.get('/', async c => {
  const { t, u, key } = await scope(c)
  const snap = await paths.userCol(t, u, 'calendarBlocks').orderBy('date').orderBy('start').limit(500).get()
  return c.json({ blocks: snap.docs.map(d => openFields(key, { ...d.data(), id: d.id }, SEALED)) })
})

calendar.post('/', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Block)
  const ref = b.id ? paths.userCol(t, u, 'calendarBlocks').doc(b.id) : paths.userCol(t, u, 'calendarBlocks').doc()
  const doc = { ...b, id: ref.id, ownerId: u, dataDomain: 'private', createdAt: now(), updatedAt: now() }
  await ref.create(sealFields(key, doc, SEALED)).catch(() => { throw new ApiError(422, 'exists', 'That calendar block already exists.') })
  return c.json({ block: doc }, 201)
})

calendar.patch('/:id', async c => {
  const { t, u, key } = await scope(c)
  const ref = paths.userCol(t, u, 'calendarBlocks').doc(id(c))
  const b = await body(c, Patch)
  if (!(await ref.get()).exists) throw new ApiError(404, 'not_found', 'That calendar block no longer exists.')
  await ref.update(sealFields(key, { ...b, updatedAt: now() }, SEALED))
  return c.json({ ok: true })
})

calendar.delete('/:id', async c => {
  const { t, u } = await scope(c)
  await paths.userCol(t, u, 'calendarBlocks').doc(id(c)).delete()
  return c.json({ ok: true })
})
