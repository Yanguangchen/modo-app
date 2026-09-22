import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { playAudio } from '../lib/audio'
import { uid } from '../lib/time'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { Disclose } from './ui'

/* Progressive disclosure: content opens as a row of chips, and nothing is shown
   until the person asks for it. Used by Clarify replies and Meetings. */
export type Aspect = {
  key: string
  label: string
  icon: IconName
  /** Colour token suffix: interp, required, unclear, ask, next, original. */
  tone: string
  count?: number
  /** Draws attention to the one chip that needs action. */
  highlight?: boolean
  node: ReactNode
}

export function Aspects({ items, label, defaultOpen = [] }: { items: Aspect[]; label: string; defaultOpen?: string[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen))
  const toggle = (k: string) => {
    playAudio('tack')
    setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  const all = items.length > 0 && items.every(a => open.has(a.key))
  const idBase = useRef(uid())
  return (
    <div className="aspects">
      <div className="aspect-bar" role="group" aria-label={label}>
        {items.map((a, i) => (
          <button
            key={a.key} type="button"
            className={`aspect-chip rise${open.has(a.key) ? ' is-open' : ''}${a.highlight ? ' is-highlight' : ''}`}
            style={{ '--i': i, '--tone': `var(--card-${a.tone})` } as CSSProperties}
            aria-expanded={open.has(a.key)} aria-controls={`${idBase.current}-${a.key}`}
            onClick={() => toggle(a.key)}
          >
            <span className="aspect-icon" aria-hidden><Icon name={a.icon} size={15} /></span>
            {a.label}
            {a.count !== undefined && <span className="aspect-count">{a.count}</span>}
          </button>
        ))}
        {items.length > 1 && (
          <button type="button" className="aspect-all" onClick={() => setOpen(all ? new Set() : new Set(items.map(a => a.key)))}>
            {all ? 'Hide all' : 'Show all'}
          </button>
        )}
      </div>
      {items.map(a => (
        <Disclose key={a.key} open={open.has(a.key)} id={`${idBase.current}-${a.key}`}>
          <div className="aspect-body">{a.node}</div>
        </Disclose>
      ))}
    </div>
  )
}
