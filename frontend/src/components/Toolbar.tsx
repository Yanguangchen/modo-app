import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { playAudio } from '../lib/audio'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/* Floating glass toolbar pinned to the bottom of the viewport.
   Fluid behaviour (after Aceternity's resizable navbar):
   - At rest it is roomy and shows short labels.
   - Once the page scrolls it condenses to icons and lifts with a stronger shadow.
   - A highlight pill glides to whichever button is under the pointer or focus.
   All motion uses the app's ease-in-out curve and stops under reduced motion. */
export function FloatingToolbar({ label, children }: { label: string; children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const target = useRef<HTMLElement | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [])

  const placePill = (instant = false) => {
    const pill = pillRef.current
    const el = target.current
    if (!pill) return
    if (!el) { pill.style.opacity = '0'; return }
    if (instant) pill.style.transition = 'none'
    pill.style.width = `${el.offsetWidth}px`
    pill.style.transform = `translateX(${el.offsetLeft}px)`
    pill.style.opacity = '1'
    if (instant) { void pill.offsetWidth; pill.style.transition = '' }
  }

  // Keep the pill glued to its button while labels expand or collapse.
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => placePill())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  const track = (el: EventTarget | null) => {
    const btn = (el as HTMLElement | null)?.closest?.('.tool-btn') as HTMLElement | null
    if (btn === target.current) return
    const wasHidden = !target.current
    target.current = btn && !btn.matches(':disabled, .is-primary') ? btn : null
    placePill(wasHidden)
  }

  const compact = scrolled

  // Portalled to <body> so no animated/transformed ancestor can pull it out of the viewport.
  return createPortal(
    <div className={`toolbar-wrap${compact ? ' is-compact' : ''}`}>
      <div
        ref={barRef}
        className={`toolbar glass glass-strong${compact ? ' is-compact' : ''}`}
        role="toolbar"
        aria-label={label}
        onPointerMove={e => track(e.target)}
        onPointerLeave={() => { target.current = null; placePill() }}
        onFocus={e => track(e.target)}
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) { target.current = null; placePill() }
        }}
      >
        <span ref={pillRef} className="tool-pill" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ToolButton({
  icon, label, short, onClick, primary, disabled, role, checked,
}: {
  icon: IconName
  label: string
  /** Visible label while the toolbar is expanded. Omit for icon-only buttons. */
  short?: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
  role?: 'radio'
  checked?: boolean
}) {
  const handleClick = () => {
    if (role === 'radio' && !checked) {
      playAudio('tack')
    }
    onClick()
  }

  const text = primary ? label : short

  return (
    <button
      type="button"
      className={`tool-btn${primary ? ' is-primary' : ''}${checked ? ' is-checked' : ''}${text ? ' has-label' : ''}`}
      aria-label={label}
      data-tip={label}
      onClick={handleClick}
      disabled={disabled}
      role={role}
      aria-checked={role ? !!checked : undefined}
      data-custom-sound={role === 'radio' ? 'true' : undefined}
    >
      <Icon name={icon} size={20} />
      {text && <span className={`tool-label${primary ? ' is-fixed' : ''}`} aria-hidden>{text}</span>}
    </button>
  )
}

export const ToolDivider = () => <span className="tool-divider" aria-hidden />
