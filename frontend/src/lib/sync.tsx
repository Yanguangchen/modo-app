import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { ApiError, api } from './api'
import { useAuth } from './auth'
import type { Persisted } from './store'
import { useStore } from './store'
import type { GuideField, MeetingPlan, Task } from './types'

/* Keeps the browser workspace and the account (Cloud Run + Firestore) in step.
   The UI keeps working from local state; this layer turns each change into the
   matching API call, so every server-side rule (transitions, encryption, audit) applies. */

type Synced = Pick<Persisted, 'prefs' | 'tasks' | 'meetings' | 'guide'>
export type SyncStatus = 'off' | 'connecting' | 'synced' | 'saving' | 'error' | 'not_invited'

const pick = (s: Persisted): Synced => ({ prefs: s.prefs, tasks: s.tasks, meetings: s.meetings, guide: s.guide })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map(x => [x.id, x]))

const TASK_FIELDS = ['title', 'why', 'minutes', 'start', 'source', 'doneWhen', 'elapsed', 'startedAt'] as const
const taskBody = (t: Task) => ({
  title: t.title, why: t.why, minutes: Math.max(1, Math.round(t.minutes)), start: t.start ?? null,
  source: t.source, doneWhen: t.doneWhen, elapsed: t.elapsed, startedAt: t.startedAt ?? null,
})

const PLAN_FIELDS = ['title', 'organizer', 'start', 'end', 'purpose', 'outcome', 'role', 'contribution', 'decisionOwner', 'materials', 'prep', 'agenda'] as const
const OUTPUT_FIELDS = ['decisions', 'actions', 'questions', 'parkingLot'] as const
const planBody = (m: MeetingPlan) => Object.fromEntries(PLAN_FIELDS.map(k => [k, m[k]]))

/** API calls that turn `prev` into `next`. Exported for tests. */
export function diffOps(prev: Synced, next: Synced): (() => Promise<unknown>)[] {
  const ops: (() => Promise<unknown>)[] = []

  if (!same(prev.prefs, next.prefs)) ops.push(() => api('PUT', '/v1/me/preferences', next.prefs))

  const pt = byId(prev.tasks)
  for (const t of next.tasks) {
    const old = pt.get(t.id)
    if (!old) {
      ops.push(async () => {
        try {
          await api('POST', '/v1/tasks', { id: t.id, state: t.state, ...taskBody(t) })
        } catch (e) {
          if (e instanceof ApiError && e.code === 'exists') await api('PATCH', `/v1/tasks/${t.id}`, taskBody(t))
          else throw e
        }
        if (t.resumeNote) await api('PUT', `/v1/tasks/${t.id}/resume-note`, { note: t.resumeNote })
      })
      continue
    }
    if (TASK_FIELDS.some(k => !same(old[k], t[k]))) ops.push(() => api('PATCH', `/v1/tasks/${t.id}`, taskBody(t)))
    if (old.state !== t.state) ops.push(() => api('POST', `/v1/tasks/${t.id}/transition`, { to: t.state }))
    if ((old.resumeNote ?? '') !== (t.resumeNote ?? '')) ops.push(() => api('PUT', `/v1/tasks/${t.id}/resume-note`, { note: t.resumeNote ?? '' }))
  }
  const nt = byId(next.tasks)
  for (const t of prev.tasks) if (!nt.has(t.id)) ops.push(() => api('DELETE', `/v1/tasks/${t.id}`))

  const pm = byId(prev.meetings)
  for (const m of next.meetings) {
    const old = pm.get(m.id)
    if (!old) {
      ops.push(async () => {
        await api('POST', '/v1/meetings', { id: m.id, ...planBody(m) }).catch(e => { if (!(e instanceof ApiError && e.code === 'exists')) throw e })
        await api('PUT', `/v1/meetings/${m.id}/outputs`, Object.fromEntries(OUTPUT_FIELDS.map(k => [k, m[k]])))
        if (m.privateNotes) await api('PUT', `/v1/meetings/${m.id}/private-notes`, { notes: m.privateNotes })
      })
      continue
    }
    if (PLAN_FIELDS.some(k => !same(old[k], m[k]))) ops.push(() => api('PATCH', `/v1/meetings/${m.id}`, planBody(m)))
    if (OUTPUT_FIELDS.some(k => !same(old[k], m[k]))) ops.push(() => api('PUT', `/v1/meetings/${m.id}/outputs`, Object.fromEntries(OUTPUT_FIELDS.map(k => [k, m[k]]))))
    if (old.privateNotes !== m.privateNotes) ops.push(() => api('PUT', `/v1/meetings/${m.id}/private-notes`, { notes: m.privateNotes }))
  }

  const pg = byId(prev.guide)
  next.guide.forEach((f, order) => {
    if (!same(pg.get(f.id), f)) ops.push(() => api('PUT', `/v1/guide/fields/${f.id}`, guideBody(f, order)))
  })

  return ops
}

export const guideBody = (f: GuideField, order: number) => ({ label: f.label, hint: f.hint, value: f.value, audience: f.audience, order })

type Workspace = { preferences: Persisted['prefs'] | null; tasks: Task[]; meetings: MeetingPlan[]; guide: GuideField[] }

export function useCloudSync() {
  const { user } = useAuth()
  const store = useStore()
  const [status, setStatus] = useState<SyncStatus>('off')
  const [attempt, setAttempt] = useState(0)
  const synced = useRef<Synced | null>(null)
  const latest = useRef(pick(store))
  latest.current = pick(store)

  // Sign-in: join the workspace, then load it (or upload this browser's data if the account is new).
  useEffect(() => {
    if (!user) { synced.current = null; setStatus('off'); return }
    let cancelled = false
    ;(async () => {
      setStatus('connecting')
      try {
        const boot = await api<{ refreshToken: boolean }>('POST', '/v1/me/bootstrap')
        if (boot.refreshToken) await user.getIdToken(true)
        const ws = await api<Workspace>('GET', '/v1/workspace')
        if (cancelled) return
        const accountEmpty = !ws.tasks.length && !ws.meetings.length && !ws.guide.length
        if (accountEmpty) {
          // First sign-in: this browser's workspace becomes the account's.
          synced.current = { prefs: ws.preferences ?? ({} as Persisted['prefs']), tasks: [], meetings: [], guide: [] }
          for (const op of diffOps(synced.current, latest.current)) await op()
          synced.current = latest.current
          store.notify('Your workspace is now saved to your account')
        } else {
          const loaded: Synced = {
            prefs: { ...latest.current.prefs, ...(ws.preferences ?? {}) },
            tasks: ws.tasks.map(t => ({ ...t, start: t.start ?? undefined, startedAt: t.startedAt ?? undefined })),
            meetings: ws.meetings,
            guide: ws.guide.map(({ id, label, hint, value, audience }) => ({ id, label, hint: hint ?? '', value, audience })),
          }
          synced.current = loaded
          store.hydrate(loaded)
        }
        setStatus('synced')
      } catch (e) {
        if (cancelled) return
        const code = e instanceof ApiError ? e.code : ''
        setStatus(code === 'not_invited' ? 'not_invited' : 'error')
        if (code === 'not_invited') store.notify('This account is not invited to the workspace')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, attempt])

  // Changes: debounce, then send only what changed.
  const snapshot = JSON.stringify(latest.current)
  useEffect(() => {
    if (!synced.current || (status !== 'synced' && status !== 'error')) return
    const t = window.setTimeout(async () => {
      const target = latest.current
      const ops = diffOps(synced.current!, target)
      if (!ops.length) return
      setStatus('saving')
      try {
        for (const op of ops) await op()
        synced.current = target
        setStatus('synced')
      } catch {
        setStatus('error') // retried on the next change, or via the status chip
      }
    }, 800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, status])

  const retry = () => {
    if (!synced.current) setAttempt(n => n + 1)
    else setStatus(s => (s === 'error' ? 'synced' : s))
  }
  const displayStatus = status === 'synced' && synced.current && !same(synced.current, latest.current) ? 'saving' : status
  return { status: displayStatus, retry }
}

/** Small top-bar chip: where the workspace is saved right now. */
export function SyncStatusChip() {
  const { status, retry } = useCloudSync()
  const { localSaved } = useStore()
  const label = {
    connecting: 'Connecting…', synced: localSaved ? 'Workspace saved to account' : 'Account synced · device save failed', saving: 'Syncing workspace…', error: 'Not synced — retry',
    not_invited: 'Account not invited', off: localSaved ? 'Saved on this device' : 'Device save failed — keep this tab open',
  }[status]
  const act = status === 'error' ? retry : undefined
  return (
    <button type="button" className={`sync-chip is-${status}`} onClick={act} disabled={!act} aria-live="polite" data-tip={label}>
      <Icon name={status === 'error' || status === 'not_invited' ? 'cloudOff' : 'cloud'} size={16} />
      <span className="sync-label">{label}</span>
    </button>
  )
}
