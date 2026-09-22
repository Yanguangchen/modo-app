import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { playAudio } from '../lib/audio'
import { useStore } from '../lib/store'
import type { Audience } from '../lib/types'
import { Icon } from './Icon'

/* Segmented control: a radiogroup with a sliding glass pill.
   Arrow keys move selection, matching native radio behaviour. */
export function Segmented<T extends string>({
  label, options, value, onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(0, options.findIndex(o => o.value === value))

  const handleSelect = (v: T) => {
    if (v !== value) {
      playAudio('tack')
      onChange(v)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (index + dir + options.length) % options.length
    handleSelect(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      <span
        className="seg-pill"
        aria-hidden
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={el => { refs.current[i] = el }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => handleSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* Native <dialog> gives focus trapping and Escape for free.
   We restore focus to the opener on close (ACC02). */
export function Modal({
  open, onClose, title, children, labelledBy,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  labelledBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const titleId = labelledBy ?? `dlg-${title.replace(/\W+/g, '-').toLowerCase()}`

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = document.activeElement
      playAudio('boop')
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  const handleClose = () => {
    playAudio('tick')
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={() => {
        onClose()
        ;(opener.current as HTMLElement | null)?.focus?.()
      }}
      onClick={e => { if (e.target === ref.current) handleClose() }}
    >
      <div className="modal-body">
        <div className="row-between">
          <h2 id={titleId} style={{ fontSize: 'var(--fs-lg)' }}>{title}</h2>
          <button type="button" className="btn btn-quiet icon-btn btn-sm" onClick={handleClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function Toasts() {
  const { toasts, announcement } = useStore()
  const prevToastCount = useRef(0)

  useEffect(() => {
    if (toasts.length > prevToastCount.current) {
      playAudio('beep')
    }
    prevToastCount.current = toasts.length
  }, [toasts])

  return (
    <>
      <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>
      <div className="toasts" aria-hidden>
        {toasts.map(t => (
          <div key={t.id} className={`toast glass glass-strong${t.leaving ? ' leaving' : ''}`}>
            <Icon name="check" size={18} />
            {t.message}
          </div>
        ))}
      </div>
    </>
  )
}

export function Disclose({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  return (
    <div id={id} className={`disclose${open ? ' open' : ''}`}>
      <div inert={!open}>{children}</div>
    </div>
  )
}

export const audienceLabel: Record<Audience, string> = {
  private: 'Private',
  selected: 'Selected people',
  team: 'Team',
  organization: 'Organization',
}

export function AudienceBadge({ audience }: { audience: Audience }) {
  const cls = audience === 'private' ? 'badge' : audience === 'organization' ? 'badge badge-info' : 'badge badge-accent'
  return (
    <span className={cls}>
      <Icon name={audience === 'private' ? 'lock' : 'users'} size={13} />
      {audienceLabel[audience]}
    </span>
  )
}

export function PrivateChip({ text = 'Private to you' }: { text?: string }) {
  return (
    <span className="privacy-chip">
      <span className="privacy-chip-icon"><Icon name="lock" size={14} /></span>
      <span className="privacy-chip-text">{text}</span>
    </span>
  )
}
