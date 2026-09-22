import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { defaultPrefs, seedBlocks, seedGuide, seedMeetings, seedTasks } from './data'
import type { CalendarBlock, GuideField, MeetingPlan, Prefs, Task } from './types'
import { uid } from './time'

/* Local persistence keeps drafts safe across refreshes (spec §19.2.7).
   Everything here is private to this browser. */
const KEY = 'clarity.v1'

export interface Persisted {
  prefs: Prefs
  tasks: Task[]
  blocks: CalendarBlock[]
  guide: GuideField[]
  meetings: MeetingPlan[]
}

const seed = (): Persisted => ({
  prefs: defaultPrefs,
  tasks: seedTasks,
  blocks: seedBlocks,
  guide: seedGuide,
  meetings: seedMeetings,
})

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const s = seed()
    return { ...s, ...parsed, prefs: { ...s.prefs, ...parsed.prefs } }
  } catch {
    return seed()
  }
}

export interface Toast { id: string; message: string; leaving?: boolean; action?: { label: string; run: () => void } }

interface Store extends Persisted {
  setPrefs: (p: Partial<Prefs>) => void
  setTasks: (fn: (t: Task[]) => Task[]) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  addTask: (t: Omit<Task, 'id' | 'state'> & Partial<Pick<Task, 'state'>>) => void
  setGuide: (fn: (g: GuideField[]) => GuideField[]) => void
  updateMeeting: (id: string, patch: Partial<MeetingPlan>) => void
  reset: () => void
  /** Replace parts of the workspace with data loaded from the account. */
  hydrate: (p: Partial<Persisted>) => void
  toasts: Toast[]
  notify: (message: string, action?: Toast['action']) => void
  dismissToast: (id: string) => void
  localSaved: boolean
  announcement: string
  captureOpen: boolean
  setCaptureOpen: (open: boolean) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [localSaved, setLocalSaved] = useState(true)
  const timers = useRef<number[]>([])

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); setLocalSaved(true) } catch { setLocalSaved(false) }
  }, [state])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const notify = useCallback((message: string, action?: Toast['action']) => {
    const id = uid()
    setToasts(t => [...t, { id, message, action }])
    // Re-set so screen readers re-announce identical messages.
    setAnnouncement('')
    requestAnimationFrame(() => setAnnouncement(message))
    if (!action) timers.current.push(
      window.setTimeout(() => setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x))), 3600),
      window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000),
    )
  }, [])

  const store = useMemo<Store>(() => ({
    ...state,
    setPrefs: p => setState(s => ({ ...s, prefs: { ...s.prefs, ...p } })),
    setTasks: fn => setState(s => ({ ...s, tasks: fn(s.tasks) })),
    updateTask: (id, patch) => setState(s => ({ ...s, tasks: s.tasks.map(t => (t.id === id ? { ...t, ...patch } : t)) })),
    addTask: t => setState(s => ({ ...s, tasks: [...s.tasks, { state: 'planned', ...t, id: uid() }] })),
    setGuide: fn => setState(s => ({ ...s, guide: fn(s.guide) })),
    updateMeeting: (id, patch) => setState(s => ({ ...s, meetings: s.meetings.map(m => (m.id === id ? { ...m, ...patch } : m)) })),
    reset: () => setState(seed()),
    hydrate: p => setState(s => ({ ...s, ...p, prefs: p.prefs ? { ...s.prefs, ...p.prefs } : s.prefs })),
    toasts,
    notify,
    dismissToast: id => setToasts(t => t.filter(x => x.id !== id)),
    localSaved,
    announcement,
    captureOpen,
    setCaptureOpen,
  }), [state, toasts, notify, announcement, captureOpen, localSaved])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

/** Applies display preferences to <html> so CSS tokens can respond. */
export function useApplyPrefs(prefs: Prefs) {
  useEffect(() => {
    const root = document.documentElement
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)')
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const transpMq = window.matchMedia('(prefers-reduced-transparency: reduce)')

    const apply = () => {
      const theme = prefs.theme === 'system' ? (darkMq.matches ? 'dark' : 'light') : prefs.theme
      const motion = prefs.motion === 'system' ? (motionMq.matches ? 'reduced' : 'full') : prefs.motion
      root.dataset.theme = theme
      root.dataset.motion = motion
      root.dataset.surface = prefs.solidSurfaces || transpMq.matches ? 'solid' : 'glass'
      root.dataset.density = prefs.density
      root.dataset.font = prefs.font
      root.style.setProperty('--text-scale', String(prefs.textScale))
    }
    apply()
    darkMq.addEventListener('change', apply)
    motionMq.addEventListener('change', apply)
    transpMq.addEventListener('change', apply)
    return () => {
      darkMq.removeEventListener('change', apply)
      motionMq.removeEventListener('change', apply)
      transpMq.removeEventListener('change', apply)
    }
  }, [prefs])
}
