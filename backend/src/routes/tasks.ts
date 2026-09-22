import { Hono } from 'hono'
import { z } from 'zod'
import { openFields, sealFields } from '../crypto.js'
import { ApiError } from '../errors.js'
import { ID_RE, paths } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'
import { body, id, now, scope } from './util.js'

export const TASK_STATES = ['planned', 'ready', 'in_progress', 'paused', 'completed', 'rescheduled', 'returned'] as const
export type TaskState = (typeof TASK_STATES)[number]
const SEALED = ['title', 'why', 'doneWhen', 'resumeNote', 'source'] as const

/** User-controlled moves, including reverse moves for frontend Undo. */
export const TRANSITIONS: Record<TaskState, TaskState[]> = {
  planned: ['ready', 'in_progress', 'paused', 'returned', 'rescheduled', 'completed'],
  ready: ['planned', 'in_progress', 'returned', 'rescheduled', 'completed'],
  returned: ['planned', 'ready', 'in_progress', 'rescheduled', 'completed'],
  in_progress: ['paused', 'completed', 'rescheduled', 'planned', 'ready', 'returned'],
  paused: ['in_progress', 'completed', 'rescheduled', 'planned'],
  rescheduled: ['returned', 'planned', 'ready', 'in_progress', 'paused', 'completed'],
  completed: ['planned', 'ready', 'returned', 'in_progress', 'paused', 'rescheduled'],
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const Fields = z.object({
  title: z.string().trim().min(1).max(300),
  why: z.string().max(1000).optional(),
  minutes: z.number().int().min(1).max(600),
  start: hhmm.nullable().optional(),
  source: z.string().max(200).optional(),
  doneWhen: z.string().max(1000).optional(),
  elapsed: z.number().min(0).max(86_400).optional(),
  startedAt: z.number().int().positive().nullable().optional(),
})
const Create = Fields.extend({ id: z.string().regex(ID_RE).optional(), state: z.enum(TASK_STATES).optional() })
const Patch = Fields.partial()

export type TaskDoc = z.infer<typeof Create> & { id: string; state: TaskState; resumeNote?: string; createdAt: string; updatedAt: string }

export const tasks = new Hono<MemberEnv>()

tasks.get('/', async c => {
  const { t, u, key } = await scope(c)
  const snap = await paths.userCol(t, u, 'tasks').orderBy('createdAt').limit(500).get()
  return c.json({ tasks: snap.docs.map(d => openFields(key, { ...d.data(), id: d.id }, SEALED)) })
})

tasks.post('/', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Create)
  const ref = b.id ? paths.userCol(t, u, 'tasks').doc(b.id) : paths.userCol(t, u, 'tasks').doc()
  const doc = { ...b, id: ref.id, state: b.state ?? 'planned', ownerId: u, dataDomain: 'private', createdAt: now(), updatedAt: now() }
  await ref.create(sealFields(key, doc, SEALED)).catch(() => { throw new ApiError(422, 'exists', 'That task already exists.') })
  return c.json({ task: doc }, 201)
})

tasks.patch('/:id', async c => {
  const { t, u, key } = await scope(c)
  const ref = paths.userCol(t, u, 'tasks').doc(id(c))
  const b = await body(c, Patch)
  if (!(await ref.get()).exists) throw new ApiError(404, 'not_found', 'That task no longer exists.')
  await ref.update(sealFields(key, { ...b, updatedAt: now() }, SEALED))
  return c.json({ ok: true })
})

tasks.post('/:id/transition', async c => {
  const { t, u } = await scope(c)
  const ref = paths.userCol(t, u, 'tasks').doc(id(c))
  const b = await body(c, z.object({ to: z.enum(TASK_STATES), elapsed: z.number().min(0).max(86_400).optional(), startedAt: z.number().int().positive().nullable().optional(), start: hhmm.nullable().optional() }))
  const snap = await ref.get()
  if (!snap.exists) throw new ApiError(404, 'not_found', 'That task no longer exists.')
  const from = snap.data()!.state as TaskState
  if (from !== b.to && !TRANSITIONS[from].includes(b.to)) throw new ApiError(422, 'invalid_transition', `A ${from.replace('_', ' ')} task cannot move to ${b.to.replace('_', ' ')}.`)
  const { to, ...rest } = b
  await ref.update({ ...rest, state: to, updatedAt: now() })
  return c.json({ ok: true, state: to })
})

tasks.put('/:id/resume-note', async c => {
  const { t, u, key } = await scope(c)
  const ref = paths.userCol(t, u, 'tasks').doc(id(c))
  const b = await body(c, z.object({ note: z.string().max(2000) }))
  if (!(await ref.get()).exists) throw new ApiError(404, 'not_found', 'That task no longer exists.')
  await ref.update(sealFields(key, { resumeNote: b.note, updatedAt: now() }, SEALED))
  return c.json({ ok: true })
})

tasks.delete('/:id', async c => {
  const { t, u } = await scope(c)
  await paths.userCol(t, u, 'tasks').doc(id(c)).delete()
  return c.json({ ok: true })
})
