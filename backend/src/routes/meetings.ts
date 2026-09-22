import { Hono } from 'hono'
import { z } from 'zod'
import { openFields, sealFields } from '../crypto.js'
import { ApiError } from '../errors.js'
import { ID_RE, paths } from '../firebase.js'
import type { MemberEnv } from '../tenancy.js'
import { MEETING_SEALED } from './me.js'
import { body, id, now, scope } from './util.js'

const text = (n = 1000) => z.string().max(n)
const list = z.array(text(500)).max(100)
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const Agenda = z.array(z.object({ id: z.string().regex(ID_RE), title: text(300), minutes: z.number().int().min(1).max(480) })).max(40)

const Plan = z.object({
  title: text(300).min(1), organizer: text(200), start: hhmm, end: hhmm,
  purpose: text(), outcome: text(), role: text(300), contribution: text(), decisionOwner: text(200),
  materials: text(), prep: text(), agenda: Agenda,
})
const Create = Plan.extend({ id: z.string().regex(ID_RE).optional() }).partial({ organizer: true, purpose: true, outcome: true, role: true, contribution: true, decisionOwner: true, materials: true, prep: true, agenda: true })
const Outputs = z.object({ decisions: list, actions: list, questions: list, parkingLot: list }).partial()

type Stored = Record<string, unknown> & { agenda?: string }
const toStored = (key: Buffer, m: Record<string, unknown>): Stored => {
  const flat = { ...m, agenda: m.agenda ? JSON.stringify(m.agenda) : undefined }
  return sealFields(key, flat, [...MEETING_SEALED, 'agenda'])
}
const fromStored = (key: Buffer, d: Stored) => {
  const o = openFields(key, d, [...MEETING_SEALED, 'agenda'])
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return { ...o, agenda: typeof o.agenda === 'string' ? JSON.parse(o.agenda) : [], decisions: arr(o.decisions), actions: arr(o.actions), questions: arr(o.questions), parkingLot: arr(o.parkingLot) }
}

export const meetings = new Hono<MemberEnv>()

meetings.get('/', async c => {
  const { t, u, key } = await scope(c)
  const snap = await paths.userCol(t, u, 'meetings').orderBy('start').limit(200).get()
  return c.json({ meetings: snap.docs.map(d => ({ ...fromStored(key, d.data()), id: d.id })) })
})

meetings.post('/', async c => {
  const { t, u, key } = await scope(c)
  const b = await body(c, Create)
  const ref = b.id ? paths.userCol(t, u, 'meetings').doc(b.id) : paths.userCol(t, u, 'meetings').doc()
  const doc = { decisions: [], actions: [], questions: [], parkingLot: [], privateNotes: '', agenda: [], ...b, id: ref.id }
  await ref.create({ ...toStored(key, doc), ownerId: u, dataDomain: 'private', createdAt: now(), updatedAt: now() })
    .catch(() => { throw new ApiError(422, 'exists', 'That meeting already exists.') })
  return c.json({ meeting: doc }, 201)
})

const load = async (c: Parameters<typeof scope>[0]) => {
  const s = await scope(c)
  const ref = paths.userCol(s.t, s.u, 'meetings').doc(id(c))
  const snap = await ref.get()
  if (!snap.exists) throw new ApiError(404, 'not_found', 'That meeting no longer exists.')
  return { ...s, ref, meeting: fromStored(s.key, snap.data() as Stored) as unknown as Record<string, unknown> & { actions: string[]; decisions: string[]; questions: string[] } }
}

meetings.get('/:id', async c => {
  const { meeting } = await load(c)
  return c.json({ meeting: { ...meeting, id: c.req.param('id') } })
})

meetings.patch('/:id', async c => {
  const { ref, key } = await load(c)
  const b = await body(c, Plan.partial())
  await ref.update({ ...toStored(key, b), updatedAt: now() })
  return c.json({ ok: true })
})

/** Replace output lists (decisions, actions, questions, parking lot). Each stays a separate list. */
meetings.put('/:id/outputs', async c => {
  const { ref, key } = await load(c)
  const b = await body(c, Outputs)
  await ref.update({ ...sealFields(key, b, ['decisions', 'actions', 'questions', 'parkingLot']), updatedAt: now() })
  return c.json({ ok: true })
})

for (const kind of ['decisions', 'actions', 'questions'] as const) {
  meetings.post(`/:id/${kind}`, async c => {
    const { ref, key, meeting } = await load(c)
    const b = await body(c, z.object({ text: text(500).min(1) }))
    const next = [...meeting[kind], b.text]
    await ref.update({ ...sealFields(key, { [kind]: next }, [kind]), updatedAt: now() })
    return c.json({ [kind]: next }, 201)
  })
}

meetings.put('/:id/private-notes', async c => {
  const { ref, key } = await load(c)
  const b = await body(c, z.object({ notes: text(20_000) }))
  await ref.update({ ...sealFields(key, { privateNotes: b.notes }, ['privateNotes']), updatedAt: now() })
  return c.json({ ok: true })
})

/** Draft a message asking the organizer for what is missing. Nothing is sent. */
meetings.post('/:id/clarify-request', async c => {
  const { meeting } = await load(c)
  const asks: [string, string][] = [
    ['purpose', 'what the purpose of the meeting is'],
    ['outcome', 'what outcome or decision we are aiming for'],
    ['role', 'what my role is'],
    ['contribution', 'what you would like me to contribute'],
    ['decisionOwner', 'who will make the final decision'],
  ]
  const missing = asks.filter(([k]) => !String(meeting[k] ?? '').trim()).map(([, q]) => q)
  if (!missing.length) return c.json({ draft: '', missing: [] })
  const name = String(meeting.organizer ?? '').split(' ')[0] || 'there'
  const draft = `Hi ${name},\n\nThanks for the invitation to “${meeting.title}”. To prepare well, could you let me know:\n\n${missing.map(m => `• ${m.charAt(0).toUpperCase()}${m.slice(1)}`).join('\n')}\n\nThank you!`
  return c.json({ draft, missing })
})

/** Copy one reviewed action into the caller's tasks, with provenance. */
meetings.post('/:id/actions/:index/accept', async c => {
  const { t, u, key, meeting } = await load(c)
  const i = Number(c.req.param('index'))
  const action = meeting.actions[i]
  if (!Number.isInteger(i) || !action?.trim()) throw new ApiError(404, 'not_found', 'That action no longer exists.')
  const b = await body(c, z.object({ minutes: z.number().int().min(5).max(480).default(30) }))
  const ref = paths.userCol(t, u, 'tasks').doc()
  const task = { id: ref.id, title: action.replace(/^Action \([^)]*\):\s*/, ''), minutes: b.minutes, state: 'planned', source: `Meeting: ${meeting.title}`, ownerId: u, dataDomain: 'private', createdAt: now(), updatedAt: now() }
  await ref.create(sealFields(key, task, ['title', 'source']))
  return c.json({ task }, 201)
})
