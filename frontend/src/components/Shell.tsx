import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { configureAudio, playAudio } from '../lib/audio'
import { useStore } from '../lib/store'
import { SyncStatusChip } from '../lib/sync'
import { AccountButton, MfaDialog } from './Account'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Modal, PrivateChip, Toasts } from './ui'

export const routes: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'Today', icon: 'today' },
  { path: '/clarify', label: 'Clarify', icon: 'clarify' },
  { path: '/meetings', label: 'Meetings', icon: 'meetings' },
  { path: '/guide', label: 'Guide AI', icon: 'sparkle' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
]

const NAV_ROW = 44 // 42px link + 2px gap
const SIDEBAR_COLLAPSED_KEY = 'clarity.sidebar.collapsed'

function loadSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { prefs, setPrefs, notify, setCaptureOpen } = useStore()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarCollapsed)
  const active = routes.findIndex(r => (r.path === '/' ? pathname === '/' : pathname.startsWith(r.path)))
  const current = routes[active] ?? routes[0]
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const toggleSidebar = () => {
    setIsSidebarCollapsed(collapsed => {
      const next = !collapsed
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* keep working in memory */ }
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

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

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
          <nav className="nav" aria-label="Main navigation">
            <span
              className="nav-pill"
              aria-hidden
              style={{ transform: `translateY(${Math.max(active, 0) * NAV_ROW}px)`, opacity: active < 0 ? 0 : 1 }}
            />
            {routes.map(r => (
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
          <div
            className="sidebar-foot stack-sm"
            title={isSidebarCollapsed ? 'Your notes and drafts are private' : undefined}
          >
            <PrivateChip text="Your notes and drafts are private" />
          </div>
        </aside>

        <div className="main">
          <header className="topbar glass">
            <div className="topbar-title">
              <strong>{current.label}</strong>
              <span className="date hide-sm">{today}</span>
            </div>
            <div className="topbar-actions">
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
      <MfaDialog />
      <Toasts />
    </>
  )
}

function QuickCapture() {
  const { captureOpen, setCaptureOpen, addTask, notify } = useStore()
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(15)

  const save = (e: FormEvent) => {
    e.preventDefault()
    const title = text.trim()
    if (!title) return
    addTask({ title, minutes, source: 'Quick capture' })
    setText('')
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
          <span className="hint">No form to fill in. You can add detail later. Saved privately.</span>
        </div>
        <div className="field" style={{ maxWidth: 200 }}>
          <label htmlFor="qc-min">Rough duration (minutes)</label>
          <input id="qc-min" type="number" min={5} step={5} value={minutes} onChange={e => setMinutes(Math.max(5, Number(e.target.value) || 5))} />
        </div>
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
