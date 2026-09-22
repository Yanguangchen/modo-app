import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: [string, string, unknown?][] = []
vi.mock('./api', () => ({
  ApiError: class extends Error { constructor(public code: string, m: string) { super(m) } },
  api: vi.fn(async (method: string, path: string, body?: unknown) => { calls.push([method, path, body]); return {} }),
}))
vi.mock('./firebase', () => ({ auth: null }))

const { diffOps } = await import('./sync')
import { defaultPrefs } from './data'
import type { GuideField, MeetingPlan, Task } from './types'

const task = (p: Partial<Task> = {}): Task => ({ id: 't1', title: 'Write', minutes: 30, state: 'planned', ...p })
const base = { prefs: defaultPrefs, tasks: [task()], meetings: [] as MeetingPlan[], guide: [] as GuideField[] }
const run = async (next: typeof base) => { for (const op of diffOps(base, next)) await op() }

describe('diffOps', () => {
  beforeEach(() => { calls.length = 0 })

  it('sends nothing when nothing changed', () => {
    expect(diffOps(base, base)).toHaveLength(0)
  })

  it('uses a transition for state changes, so the server enforces the rules', async () => {
    await run({ ...base, tasks: [task({ state: 'in_progress' })] })
    expect(calls).toEqual([['POST', '/v1/tasks/t1/transition', { to: 'in_progress' }]])
  })

  it('creates, edits, and deletes tasks', async () => {
    await run({ ...base, tasks: [task({ title: 'Write more' }), task({ id: 't2', title: 'New' })] })
    expect(calls.map(c => `${c[0]} ${c[1]}`)).toEqual(['PATCH /v1/tasks/t1', 'POST /v1/tasks'])
    calls.length = 0
    await run({ ...base, tasks: [] })
    expect(calls).toEqual([['DELETE', '/v1/tasks/t1', undefined]])
  })

  it('saves resume notes through their own route', async () => {
    await run({ ...base, tasks: [task({ resumeNote: 'Open page 2' })] })
    expect(calls).toEqual([['PUT', '/v1/tasks/t1/resume-note', { note: 'Open page 2' }]])
  })

  it('never shares guide answers when saving them', async () => {
    await run({ ...base, guide: [{ id: 'g1', label: 'Format', hint: '', value: 'Written', audience: 'organization' }] })
    expect(calls.map(c => c[1])).toEqual(['/v1/guide/fields/g1'])
  })
})
