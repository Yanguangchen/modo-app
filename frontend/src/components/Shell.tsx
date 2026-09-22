import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { configureAudio, playAudio } from '../lib/audio'
import { useStore } from '../lib/store'
import { useLocalState } from '../lib/local-state'
import { SyncStatusChip } from '../lib/sync'
import { AccountButton } from './Account'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Modal, Toasts } from './ui'

export const routes: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Today', icon: 'today' },
  { path: '/clarify', label: 'Clarify', icon: 'clarify' },
  { path: '/meetings', label: 'Meetings', icon: 'meetings' },
  { path: '/guide', label: 'Communication style', icon: 'sparkle' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]
const primaryRoutes = routes.filter(route => route.path !== '/settings')

const SIDEBAR_COLLAPSED_KEY = 'clarity.sidebar.collapsed'
const TOPBAR_COMPRESSED_KEY = 'clarity.topbar.compressed'

function loadSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function loadTopbarCompressed() {
  try {
    return localStorage.getItem(TOPBAR_COMPRESSED_KEY) === 'true'
  } catch {
    return false
  }
}

function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Glide each icon from its previous spot into the new stack. */
function shiftNavLinks(nav: HTMLElement, from: DOMRect[]) {
  if (prefersReducedMotion()) return
  const links = [...nav.querySelectorAll<HTMLElement>('.nav-link')]
  const moving: HTMLElement[] = []
  links.forEach((el, i) => {
    const start = from[i]
    if (!start) return
    const end = el.getBoundingClientRect()
    const dx = start.left - end.left
    const dy = start.top - end.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
    moving.push(el)
  })
  if (!moving.length) return
  nav.getBoundingClientRect()
  requestAnimationFrame(() => {
    for (const el of moving) {
      el.style.transition = 'transform var(--dur-3) var(--ease)'
      el.style.transform = ''
      const done = (event: TransitionEvent) => {
        if (event.propertyName !== 'transform') return
        el.style.transition = ''
        el.removeEventListener('transitionend', done)
      }
      el.addEventListener('transitionend', done)
    }
  })
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const delay = 60_000 - (Date.now() % 60_000)
    let interval = 0
    const timeout = window.setTimeout(() => {
      tick()
      interval = window.setInterval(tick, 60_000)
    }, delay)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [])
  return now
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { prefs, setPrefs, notify, setCaptureOpen } = useStore()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [isTopbarCompressed, setIsTopbarCompressed] = useState(loadTopbarCompressed)
  const now = useNow()
  const active = routes.findIndex(r => (r.path === '/' ? pathname === '/' : pathname.startsWith(r.path)))
  const current = routes[active] ?? routes[0]

  // The highlight follows the active link's real position, whether the links are packed or spread.
  const navRef = useRef<HTMLElement>(null)
  const flipFrom = useRef<DOMRect[] | null>(null)
  const [pill, setPill] = useState({ top: 0, height: 0 })
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const link = nav.querySelectorAll<HTMLElement>('.nav-link')[active]
      const top = link?.offsetTop ?? 0
      const height = link?.offsetHeight ?? 0
      setPill(p => (p.top === top && p.height === height ? p : { top, height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [active])
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const toggleSidebar = () => {
    const nav = navRef.current
    flipFrom.current = nav
      ? [...nav.querySelectorAll<HTMLElement>('.nav-link')].map(el => el.getBoundingClientRect())
      : null
    setIsSidebarCollapsed(collapsed => {
      const next = !collapsed
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* keep working in memory */ }
      return next
    })
  }

  useLayoutEffect(() => {
    const from = flipFrom.current
    flipFrom.current = null
    const nav = navRef.current
    if (!from || !nav) return
    shiftNavLinks(nav, from)
  }, [isSidebarCollapsed])

  const toggleTopbar = () => {
    setIsTopbarCompressed(compressed => {
      const next = !compressed
      try { localStorage.setItem(TOPBAR_COMPRESSED_KEY, String(next)) } catch { /* keep working in memory */ }
      return next
    })
  }

  useEffect(() => {
    configureAudio({ enabled: prefs.soundEnabled, volume: prefs.soundVolume })
  }, [prefs.soundEnabled, prefs.soundVolume])

  // Global tactile feedback for user clicks & selects
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // If clicked inside segmented control or elements that play their own sounds, skip default tick
      if (target.closest('.segmented') || target.closest('[data-custom-sound]')) return

      const clickable = target.closest('button, a, input[type="checkbox"], input[type="radio"]')
      if (clickable) {
        playAudio('tick')
      }
    }

    const handleChange = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.tagName === 'SELECT' || (target as HTMLInputElement).type === 'radio') {
        playAudio('tack')
      }
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('change', handleChange, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('change', handleChange, true)
    }
  }, [])

  useEffect(() => {
    document.title = `${current.label} · Clarity Workspace`
  }, [current.label])

  // Shortcuts: Ctrl/Cmd + K (Quick capture), Ctrl/Cmd + B (Toggle sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      const isInputActive = activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.getAttribute('contenteditable') === 'true'

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !document.documentElement.dataset.focus) {
        e.preventDefault()
        setCaptureOpen(true)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !isInputActive && !document.documentElement.dataset.focus) {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCaptureOpen])

  const today = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const clock = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="backdrop" aria-hidden>
        <span className="blob" /><span className="blob" /><span className="blob" /><span className="blob" />
      </div>

      <div className={`app${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <aside id="primary-sidebar" className="sidebar glass" aria-label="Primary">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-controls="primary-sidebar"
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? `Expand sidebar (${isMac ? '⌘B' : 'Ctrl+B'})` : `Collapse sidebar (${isMac ? '⌘B' : 'Ctrl+B'})`}
          >
            <span className="sidebar-toggle-icon" aria-hidden>
              <Icon name="chevronLeft" size={16} />
            </span>
          </button>
          <nav className="nav" aria-label="Main navigation" ref={navRef}>
            <span
              className="nav-pill"
              aria-hidden
              style={{ transform: `translateY(${pill.top}px)`, height: pill.height, opacity: active < 0 || !pill.height ? 0 : 1 }}
            />
            {primaryRoutes.map(r => (
              <NavLink
                key={r.path}
                to={r.path}
                end={r.path === '/'}
                className="nav-link"
                aria-label={isSidebarCollapsed ? r.label : undefined}
                data-nav-label={isSidebarCollapsed ? r.label : undefined}
              >
                <span className="nav-icon"><Icon name={r.icon} /></span>
                <span className="nav-label" aria-hidden={isSidebarCollapsed}>{r.label}</span>
              </NavLink>
            ))}
          </nav>
          <nav className="sidebar-settings" aria-label="Settings navigation">
            <NavLink to="/settings" className="sidebar-settings-link" aria-label="Settings" title="Settings">
              <Icon name="settings" size={22} />
            </NavLink>
          </nav>
        </aside>

        <div className="main">
          <header className={`topbar glass${isTopbarCompressed ? ' is-compressed' : ''}`}>
            <div className="topbar-title">
              {isTopbarCompressed ? null : <strong>{current.label}</strong>}
              <span className="topbar-when">
                <span className="date">{today}</span>
                <time className="clock" dateTime={now.toISOString()}>{clock}</time>
              </span>
            </div>
            <div className="topbar-actions" id="topbar-tools">
              {isTopbarCompressed ? null : (
                <>
                  <SyncStatusChip />
                  <AccountButton />
                  <button
                    type="button"
                    className="btn btn-quiet icon-btn"
                    onClick={() => {
                      const next = !prefs.soundEnabled
                      setPrefs({ soundEnabled: next })
                      playAudio(next ? 'beep' : 'boop')
                      notify(next ? 'Audio feedback: unmuted' : 'Audio feedback: muted')
                    }}
                    aria-label={prefs.soundEnabled ? 'Mute audio feedback' : 'Unmute audio feedback'}
                    title={prefs.soundEnabled ? 'Mute audio feedback' : 'Unmute audio feedback'}
                  >
                    <Icon name={prefs.soundEnabled ? 'volume' : 'volumeMute'} size={18} />
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-quiet icon-btn topbar-toggle"
                onClick={toggleTopbar}
                aria-expanded={!isTopbarCompressed}
                aria-controls="topbar-tools"
                aria-label={isTopbarCompressed ? 'Expand toolbar' : 'Compress toolbar'}
                title={isTopbarCompressed ? 'Expand toolbar' : 'Compress toolbar'}
              >
                <Icon name="chevronDown" size={18} />
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setCaptureOpen(true)} aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}>
                <Icon name="plus" size={18} />
                Quick capture
                <kbd className="hide-sm" style={{ background: 'rgba(255,255,255,.18)', color: 'inherit', borderColor: 'transparent' }}>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
              </button>
            </div>
          </header>

          <main id="main" tabIndex={-1} style={{ outline: 'none' }}>
            <div key={pathname} className="page-enter">{children}</div>
          </main>
        </div>
      </div>

      <nav className="bottom-nav glass glass-strong" aria-label="Main navigation (compact)">
        {routes.map(r => (
          <NavLink key={r.path} to={r.path} end={r.path === '/'}>
            <Icon name={r.icon} />
            {r.label}
          </NavLink>
        ))}
      </nav>

      <QuickCapture />
      <Toasts />
    </>
  )
}

function QuickCapture() {
  const { captureOpen, setCaptureOpen, addTask, notify } = useStore()
  const [text, setText] = useLocalState('clarity.capture.draft', '')
  const [minutes, setMinutes] = useState(15)

  const save = (e: FormEvent) => {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    addTask({ title, minutes, source: 'Quick capture' })
    setText('')
    setMinutes(15)
    setCaptureOpen(false)
    playAudio('boop')
    notify('Saved to your unscheduled tray')
  }

  return (
    <Modal open={captureOpen} onClose={() => setCaptureOpen(false)} title="Quick capture">
      <form className="stack" onSubmit={save}>
        <div className="field">
          <label htmlFor="qc-text">What do you want to remember?</label>
          <textarea
            id="qc-text"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="A task, a thought, or something someone asked you…"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(e) }}
          />
          <span className="hint">Only a name is needed. Tasks use a 15-minute estimate unless you change it.</span>
        </div>
        <details className="ux-details"><summary>Add a duration (optional)</summary><div className="field" style={{ maxWidth: 200 }}>
          <label htmlFor="qc-min">Rough duration (minutes)</label>
          <input id="qc-min" type="number" min={5} step={5} value={minutes} onChange={e => setMinutes(Math.max(5, Number(e.target.value) || 5))} />
        </div></details>
        <div className="modal-foot">
          <button type="button" className="btn btn-quiet" onClick={() => setCaptureOpen(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            <Icon name="inbox" size={18} />
            Save to tray
          </button>
        </div>
      </form>
    </Modal>
  )
}
