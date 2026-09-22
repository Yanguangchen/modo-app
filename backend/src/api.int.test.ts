/* End-to-end API tests against the Firestore and Auth emulators.
   Run with: npm run test:int */
import { getAuth } from 'firebase-admin/auth'
import type { MiddlewareHandler } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Generate } from './ai.js'
import { createApp } from './app.js'
import type { Caller } from './auth.js'
import { config } from './config.js'
import { adminApp, db, paths } from './firebase.js'
import { seedArticles } from './knowledge.js'
import type { ModelOutput } from './transform.js'

const T = config.pilotTenantId

// Test identity: the emulator issues real users; the header picks who is calling.
const identities = new Map<string, Caller>()
const authenticate: MiddlewareHandler<{ Variables: { caller: Caller } }> = async (c, next) => {
  const who = identities.get(c.req.header('x-test-user') ?? '')
  if (!who) return c.json({ code: 'unauthenticated' }, 401)
  const claims = (await getAuth(adminApp()).getUser(who.uid)).customClaims ?? {}
  c.set('caller', { ...who, tenantId: claims.tenant_id as string | undefined, roles: (claims.roles as string[]) ?? [] })
  await next()
}

const modelOut: ModelOutput = {
  interpretation: [{ text: 'This appears to ask for Q3 numbers.', sourceQuote: 'numbers for Q3' }],
  required: [{ text: 'Pull together the numbers', sourceQuote: 'pull together the numbers' }],
  unclear: [{ text: 'No deadline is stated.', sourceQuote: '' }],
  questions: [{ text: 'When do you need this by?' }],
  next: [{ text: 'Draft the summary', minutes: 30, doneWhen: 'Summary exists' }],
  draft: '', assumptions: [],
}
const generate: Generate = async ({ schema, route }) =>
  schema.parse(route === 'guide_chat' ? { answer: 'Be specific.', citedDocumentIds: ['k3'] } : modelOut)

const app = createApp({ generate, authenticate })
const call = (who: string, method: string, path: string, body?: unknown) =>
  app.request(`/v1${path}`, { method, headers: { 'content-type': 'application/json', 'x-test-user': who }, body: body ? JSON.stringify(body) : undefined })
const json = async (r: Response) => ({ status: r.status, body: await r.json() as Record<string, any> })

async function makeUser(name: string, email: string) {
  const u = await getAuth(adminApp()).createUser({ email, emailVerified: true })
  identities.set(name, { uid: u.uid, email, emailVerified: true, roles: [] })
  return u.uid
}

let ownerUid = '', teammateUid = '', outsiderUid = ''

beforeAll(async () => {
  expect(process.env.FIRESTORE_EMULATOR_HOST, 'run through npm run test:int').toBeTruthy()
  await db().recursiveDelete(db().collection('tenants'))
  config.bootstrapAdmins.splice(0, config.bootstrapAdmins.length, 'boss@example.com')
  await paths.tenant(T).set({ invites: ['owner@example.com', 'mate@example.com', 'other@example.com'], admins: [] })
  for (const a of seedArticles) await paths.knowledge(T).doc(a.id).set(a)
  await makeUser('admin', 'boss@example.com')
  ownerUid = await makeUser('owner', 'owner@example.com')
  teammateUid = await makeUser('mate', 'mate@example.com')
  outsiderUid = await makeUser('other', 'other@example.com')
  await makeUser('stranger', 'nobody@example.com')
})

describe('membership', () => {
  it('rejects uninvited people and admits invited ones', async () => {
    expect((await json(await call('stranger', 'POST', '/me/bootstrap'))).body.code).toBe('not_invited')
    for (const who of ['admin', 'owner', 'mate', 'other']) {
      const r = await json(await call(who, 'POST', '/me/bootstrap'))
      expect(r.status).toBe(200)
      expect(r.body.refreshToken).toBe(true)
    }
    expect((await json(await call('admin', 'GET', '/me'))).body.roles).toEqual(['member', 'admin', 'knowledge_owner'])
    expect((await json(await call('owner', 'GET', '/me'))).body.roles).toEqual(['member'])
  })

  it('blocks tenant routes before bootstrap', async () => {
    expect((await json(await call('stranger', 'GET', '/tasks'))).body.code).toBe('not_bootstrapped')
  })
})

describe('tasks', () => {
  it('stores bodies encrypted and enforces transitions', async () => {
    const c = await json(await call('owner', 'POST', '/tasks', { id: 't1', title: 'Secret plan', minutes: 30, start: '10:00' }))
    expect(c.status).toBe(201)
    const raw = (await paths.userCol(T, ownerUid, 'tasks').doc('t1').get()).data()!
    expect(String(raw.title).startsWith('v1:')).toBe(true)
    expect(JSON.stringify(raw)).not.toContain('Secret plan')

    expect((await json(await call('owner', 'POST', '/tasks/t1/transition', { to: 'in_progress', startedAt: Date.now() }))).status).toBe(200)
    // Reverse moves are now supported for Undo, including after a sync.
    expect((await json(await call('owner', 'POST', '/tasks/t1/transition', { to: 'completed' }))).status).toBe(200)
    expect((await json(await call('owner', 'POST', '/tasks/t1/transition', { to: 'in_progress' }))).status).toBe(200)
    expect((await json(await call('owner', 'PUT', '/tasks/t1/resume-note', { note: 'Open the doc' }))).status).toBe(200)

    const list = await json(await call('owner', 'GET', '/tasks'))
    expect(list.body.tasks[0]).toMatchObject({ title: 'Secret plan', state: 'in_progress', resumeNote: 'Open the doc' })
    expect((await json(await call('mate', 'GET', '/tasks'))).body.tasks).toHaveLength(0)
  })
})

describe('working guide', () => {
  it('shares only confirmed snapshots, by audience, and revokes', async () => {
    await call('owner', 'PUT', '/guide/fields/g1', { label: 'Format', value: 'Written first', audience: 'organization' })
    await call('owner', 'PUT', '/guide/fields/g2', { label: 'Feedback', value: 'In writing', audience: 'team' })
    await call('owner', 'PUT', '/guide/fields/g3', { label: 'Health', value: 'Private note', audience: 'private' })

    // Nothing is visible before sharing.
    expect((await json(await call('mate', 'GET', `/guide/shared/${ownerUid}`))).body.fields).toEqual([])

    const preview = await json(await call('owner', 'POST', '/guide/preview', { as: 'team' }))
    expect(preview.body.fields.map((f: { label: string }) => f.label)).toEqual(['Format', 'Feedback'])

    expect((await json(await call('owner', 'POST', '/guide/share', { confirm: false }))).body.code).toBe('confirmation_required')
    expect((await json(await call('owner', 'POST', '/guide/share', { confirm: true }))).body.version).toBe(1)

    // Same team sees team + organization fields; others see organization only; nobody sees private.
    await call('admin', 'PUT', `/admin/users/${ownerUid}`, { teamId: 'blue', confirm: true })
    await call('admin', 'PUT', `/admin/users/${teammateUid}`, { teamId: 'blue', confirm: true })
    const mate = await json(await call('mate', 'GET', `/guide/shared/${ownerUid}`))
    expect(mate.body.fields.map((f: { label: string }) => f.label)).toEqual(['Format', 'Feedback'])
    const other = await json(await call('other', 'GET', `/guide/shared/${ownerUid}`))
    expect(other.body.fields.map((f: { label: string }) => f.label)).toEqual(['Format'])

    await call('owner', 'POST', '/guide/revoke', { confirm: true })
    expect((await json(await call('mate', 'GET', `/guide/shared/${ownerUid}`))).body.fields).toEqual([])
    // Revocation keeps the owner's private source.
    expect((await json(await call('owner', 'GET', '/guide/fields'))).body.fields).toHaveLength(3)
  })
})

describe('AI routes use server-side context', () => {
  it('persists transformations with versions and restore', async () => {
    const r = await json(await call('owner', 'POST', '/transformations', { text: 'Could you pull together the numbers for Q3?', mode: 'explicit' }))
    expect(r.status).toBe(201)
    const tid = r.body.id as string
    const raw = (await paths.userCol(T, ownerUid, 'transformations').doc(tid).get()).data()!
    expect(String(raw.output).startsWith('v1:')).toBe(true)
    expect((await json(await call('owner', 'PATCH', `/transformations/${tid}`, { result: { ...r.body.result, questions: [] } }))).body.version).toBe(2)
    const restored = await json(await call('owner', 'POST', `/transformations/${tid}/restore`, { version: 1 }))
    expect(restored.body.result.questions).toHaveLength(1)
    expect((await json(await call('mate', 'GET', `/transformations/${tid}`))).status).toBe(404)
  })

  it('cites only published knowledge', async () => {
    const r = await json(await call('owner', 'POST', '/guide/chat', { message: 'How do I give useful feedback?', context: { workingGuide: true, publishedKnowledge: true } }))
    expect(r.body.citations).toEqual([{ title: 'Giving useful feedback', owner: 'People & Culture', version: 'v1.4' }])
  })
})

describe('knowledge publishing', () => {
  it('hides drafts until a confirmed publish', async () => {
    expect((await json(await call('owner', 'POST', '/knowledge', { title: 'x', summary: '', body: '', owner: 'o', source: 's', nextReview: '2027-01-01' }))).status).toBe(403)
    const d = await json(await call('admin', 'POST', '/knowledge', { title: 'Async standups', summary: 'Written updates', body: 'Post by 10:00.', owner: 'Ops', source: 'Ops guide', nextReview: '2027-01-01' }))
    const list = async () => (await json(await call('owner', 'GET', '/knowledge'))).body.articles.map((a: { title: string }) => a.title)
    expect(await list()).not.toContain('Async standups')
    expect((await json(await call('admin', 'PATCH', `/knowledge/${d.body.id}`, { state: 'published' }))).body.code).toBe('confirmation_required')
    expect((await json(await call('admin', 'PATCH', `/knowledge/${d.body.id}`, { state: 'published', confirm: true }))).body.version).toBe('v1.0')
    expect(await list()).toContain('Async standups')
  })
})

describe('admin privacy boundary', () => {
  it('has no route to private content and withholds small cohorts', async () => {
    expect((await json(await call('owner', 'GET', '/admin/users'))).status).toBe(403)
    const m = await json(await call('admin', 'GET', '/admin/metrics'))
    expect(m.body.metrics.members).toBeNull() // 4 members < cohort of 5
    const users = JSON.stringify((await json(await call('admin', 'GET', '/admin/users'))).body)
    expect(users).not.toContain('Secret plan')
    expect((await json(await call('admin', 'GET', `/tasks`))).body.tasks).toHaveLength(0) // own tasks only
  })

  it('keeps an intact audit chain', async () => {
    const a = await json(await call('admin', 'GET', '/admin/audit'))
    expect(a.body.events.length).toBeGreaterThan(5)
    expect(a.body.chainIntact).toBe(true)
    expect(JSON.stringify(a.body)).not.toContain('Written first')
  })
})

describe('export and deletion', () => {
  it('exports decrypted data and deletes it on confirmation', async () => {
    const ex = await json(await call('owner', 'POST', '/me/export'))
    expect(ex.body.tasks[0].title).toBe('Secret plan')
    expect((await json(await call('owner', 'DELETE', '/me/data', { confirm: true }))).status).toBe(200)
    expect((await paths.userCol(T, ownerUid, 'tasks').get()).empty).toBe(true)
    void outsiderUid
  })
})
