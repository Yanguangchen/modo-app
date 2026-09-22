import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { formatDuration, fromMinutes, toMinutes } from '../lib/time'
import type { BlockKind, Task, TaskState } from '../lib/types'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export type Kind = BlockKind | 'task'
export type Item = { id: string; title: string; start: string; end: string; kind: Kind; task?: Task }

export const kindMeta: Record<Kind, { label: string; plural: string; icon: IconName }> = {
  meeting: { label: 'Meeting', plural: 'Meetings', icon: 'users' },
  focus: { label: 'Focus', plural: 'Focus blocks', icon: 'target' },
  task: { label: 'Task', plural: 'Tasks', icon: 'task' },
  break: { label: 'Break', plural: 'Breaks', icon: 'coffee' },
  buffer: { label: 'Transition', plural: 'Transitions', icon: 'hourglass' },
}

export function KindIcon({ kind, size = 16 }: { kind: Kind; size?: number }) {
  return (
    <span className="kind-icon" style={{ '--kind': `var(--kind-${kind})` } as CSSProperties} aria-hidden>
      <Icon name={kindMeta[kind].icon} size={size} />
    </span>
  )
}

const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'

/** Runs a state change inside a View Transition when available, so moved things glide. */
function withTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || reducedMotion()) { fn(); return }
  doc.startViewTransition(() => flushSync(fn))
}

const span = (items: Item[]) => {
  const s = Math.min(...items.map(i => toMinutes(i.start)))
  const e = Math.max(...items.map(i => toMinutes(i.end)))
  return { start: Math.floor(s / 60) * 60, end: Math.ceil(e / 60) * 60 }
}

/* ── 1. Kanban ─────────────────────────────────────────────── */

export type Column = 'todo' | 'doing' | 'done'
const columns: { id: Column; title: string; icon: IconName; states: TaskState[] }[] = [
  { id: 'todo', title: 'To do', icon: 'list', states: ['planned', 'ready', 'returned'] },
  { id: 'doing', title: 'Doing', icon: 'play', states: ['in_progress', 'paused'] },
  { id: 'done', title: 'Done', icon: 'check', states: ['completed'] },
]

export function KanbanView({ tasks, currentId, onMove }: { tasks: Task[]; currentId?: string; onMove: (t: Task, to: Column) => void }) {
  const [over, setOver] = useState<Column | null>(null)
  const today = tasks.filter(t => t.start || t.state === 'completed')

  const move = (t: Task, to: Column) => withTransition(() => onMove(t, to))

  const onDrop = (e: DragEvent, col: Column) => {
    e.preventDefault()
    setOver(null)
    const t = today.find(x => x.id === e.dataTransfer.getData('text/plain'))
    if (t && !columns.find(c => c.id === col)!.states.includes(t.state)) move(t, col)
  }

  return (
    <div className="kanban">
      {columns.map((c, ci) => {
        const cards = today
          .filter(t => c.states.includes(t.state))
          .sort((a, b) => toMinutes(a.start ?? '23:59') - toMinutes(b.start ?? '23:59'))
        return (
          <section
            key={c.id}
            className={`kanban-col glass-inset${over === c.id ? ' is-over' : ''}`}
            aria-labelledby={`kb-${c.id}`}
            onDragOver={e => { e.preventDefault(); setOver(c.id) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
            onDrop={e => onDrop(e, c.id)}
          >
            <h3 id={`kb-${c.id}`} className="kanban-head">
              <Icon name={c.icon} size={16} />{c.title}<span className="badge">{cards.length}</span>
            </h3>
            <ul className="kanban-list">
              {cards.map(t => (
                <li
                  key={t.id}
                  className={`kanban-card glass${t.id === currentId ? ' is-now' : ''}`}
                  style={{ viewTransitionName: `kb-${t.id}` } as CSSProperties}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
                >
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--s2)', alignItems: 'flex-start' }}>
                    <KindIcon kind="task" size={14} />
                    <span className="kanban-title">{t.title}</span>
                  </div>
                  <div className="row-between">
                    <span className="faint row" style={{ gap: 4 }}>
                      <Icon name="clock" size={13} />{t.start ?? '—'} · {t.minutes}m
                      {t.state === 'paused' && <span className="badge badge-warn">Paused</span>}
                    </span>
                    <span className="kanban-moves">
                      {ci > 0 && (
                        <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Move “${t.title}” to ${columns[ci - 1].title}`} data-tip={columns[ci - 1].title} onClick={() => move(t, columns[ci - 1].id)}>
                          <Icon name="chevronLeft" size={16} />
                        </button>
                      )}
                      {ci < columns.length - 1 && (
                        <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Move “${t.title}” to ${columns[ci + 1].title}`} data-tip={columns[ci + 1].title} onClick={() => move(t, columns[ci + 1].id)}>
                          <Icon name="chevronRight" size={16} />
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
              {cards.length === 0 && <li className="kanban-empty">Drop here</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/* ── 2. Zoomable timeline ──────────────────────────────────── */

const MIN_PPM = 1
const MAX_PPM = 14
const LANE_H = 64
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function ZoomTimeline({ items, nowMin, currentId }: { items: Item[]; nowMin: number; currentId?: string }) {
  const { start, end } = span(items)
  const scroller = useRef<HTMLDivElement>(null)
  const [ppm, setPpm] = useState(2) // pixels per minute
  const [fit, setFit] = useState(2)
  const anchor = useRef<{ min: number; x: number } | null>(null)
  const anim = useRef(0)

  // Pack overlapping items into lanes; transitions get their own thin strip.
  const { lanes, laneCount } = useMemo(() => {
    const main = items.filter(i => i.kind !== 'buffer')
    const ends: number[] = []
    const lanes = new Map<string, number>()
    for (const i of main) {
      const s = toMinutes(i.start)
      let l = ends.findIndex(e => e <= s)
      if (l < 0) { l = ends.length; ends.push(0) }
      ends[l] = toMinutes(i.end)
      lanes.set(i.id, l)
    }
    return { lanes, laneCount: Math.max(1, ends.length) }
  }, [items])

  // Fit the whole day on first render and on resize.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      const f = Math.max(MIN_PPM, (el.clientWidth - 56) / (end - start))
      setFit(f)
      setPpm(p => (p === 2 ? f : p))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [start, end])

  // Keep the anchored minute under the same screen x while zooming.
  useLayoutEffect(() => {
    const el = scroller.current
    const a = anchor.current
    if (el && a) el.scrollLeft = (a.min - start) * ppm - a.x
  }, [ppm, start])

  const zoomTo = (target: number, x?: number) => {
    const el = scroller.current
    if (!el) return
    const next = Math.min(MAX_PPM, Math.max(Math.min(fit, MIN_PPM * 1.5), target))
    const ax = x ?? el.clientWidth / 2
    anchor.current = { min: start + (el.scrollLeft + ax) / ppm, x: ax }
    cancelAnimationFrame(anim.current)
    if (reducedMotion()) { setPpm(next); return }
    const from = ppm
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 320)
      setPpm(from + (next - from) * easeInOut(k))
      if (k < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const x = e.clientX - el.getBoundingClientRect().left
      const factor = Math.exp(-e.deltaY * 0.004)
      const next = Math.min(MAX_PPM, Math.max(MIN_PPM, ppm * factor))
      anchor.current = { min: start + (el.scrollLeft + x) / ppm, x }
      setPpm(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ppm, start])

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomTo(ppm * 1.6) }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTo(ppm / 1.6) }
    if (e.key === '0') { e.preventDefault(); zoomTo(fit) }
  }

  const step = ppm >= 7 ? 15 : ppm >= 3 ? 30 : 60
  const ticks: number[] = []
  for (let m = start; m <= end; m += step) ticks.push(m)
  const width = (end - start) * ppm + 48 // room for the final hour label
  const detail = ppm >= 5 ? 'high' : ppm >= 2.5 ? 'mid' : 'low'
  const zoomPct = Math.round((ppm / fit) * 100)

  return (
    <div className="zt">
      <div className="zt-controls">
        <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label="Zoom out" data-tip="Zoom out" onClick={() => zoomTo(ppm / 1.6)} disabled={ppm <= MIN_PPM}>
          <Icon name="zoomOut" size={18} />
        </button>
        <input
          type="range" aria-label="Zoom" min={Math.log(MIN_PPM)} max={Math.log(MAX_PPM)} step={0.01}
          value={Math.log(ppm)} onChange={e => zoomTo(Math.exp(Number(e.target.value)))}
          style={{ accentColor: 'var(--accent)', width: 140 }}
        />
        <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label="Zoom in" data-tip="Zoom in" onClick={() => zoomTo(ppm * 1.6)} disabled={ppm >= MAX_PPM}>
          <Icon name="zoomIn" size={18} />
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => zoomTo(fit)}><Icon name="focus" size={16} />Fit day</button>
        <span className="faint">{zoomPct}% · <kbd>⌘</kbd>+scroll</span>
      </div>

      <div
        ref={scroller}
        className={`zt-scroll detail-${detail}`}
        tabIndex={0}
        role="region"
        aria-label="Timeline. Use plus and minus to zoom, arrow keys to scroll."
        onKeyDown={onKey}
      >
        <div className="zt-track" style={{ width, height: 28 + laneCount * LANE_H + 26 }}>
          {ticks.map(m => (
            <div key={m} className={`zt-tick${m % 60 === 0 ? ' is-hour' : ''}`} style={{ left: (m - start) * ppm }}>
              <span>{m % 60 === 0 || detail !== 'low' ? fromMinutes(m) : ''}</span>
            </div>
          ))}

          <ol className="zt-items" aria-label="Scheduled items">
            {items.map(i => {
              const s = toMinutes(i.start)
              const d = toMinutes(i.end) - s
              const w = Math.max(6, d * ppm - 3)
              const isBuffer = i.kind === 'buffer'
              const top = isBuffer ? 28 + laneCount * LANE_H + 4 : 28 + (lanes.get(i.id) ?? 0) * LANE_H + 6
              return (
                <li
                  key={i.id}
                  className={`zt-item k-${i.kind}${isBuffer ? ' is-buffer' : ''}${i.id === currentId ? ' is-now' : ''}${i.task?.state === 'completed' ? ' is-done' : ''}${w < 44 ? ' is-tiny' : ''}`}
                  style={{ left: (s - start) * ppm, width: w, top, '--kind': `var(--kind-${i.kind})` } as CSSProperties}
                  aria-label={`${kindMeta[i.kind].label}: ${i.title}, ${i.start} to ${i.end}`}
                  title={`${i.title} · ${i.start}–${i.end}`}
                >
                  {!isBuffer && (
                    <>
                      <Icon name={kindMeta[i.kind].icon} size={15} />
                      <span className="zt-text" aria-hidden>
                        <span className="zt-title">{i.title}</span>
                        <span className="zt-meta">{i.start}–{i.end} · {formatDuration(d)}{i.task && i.task.state !== 'planned' ? ` · ${i.task.state.replace('_', ' ')}` : ''}</span>
                      </span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>

          {nowMin >= start && nowMin <= end && (
            <div className="zt-now" style={{ left: (nowMin - start) * ppm }} aria-label={`Now, ${fromMinutes(nowMin)}`}>
              <span>{fromMinutes(nowMin)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 3. Gantt by category ──────────────────────────────────── */

const order: Kind[] = ['meeting', 'focus', 'task', 'break', 'buffer']

export function GanttView({ items, nowMin, currentId }: { items: Item[]; nowMin: number; currentId?: string }) {
  const { start, end } = span(items)
  const total = end - start
  const [collapsed, setCollapsed] = useState<Set<Kind>>(() => new Set(['buffer']))
  const pct = (m: number) => `${((m - start) / total) * 100}%`
  const hours: number[] = []
  for (let m = start; m <= end; m += 60) hours.push(m)
  const planned = items.reduce((n, i) => n + toMinutes(i.end) - toMinutes(i.start), 0)

  const toggle = (k: Kind) => withTransition(() => setCollapsed(c => {
    const n = new Set(c)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  }))

  return (
    <div className="gantt" role="table" aria-label="Time allocated by category">
      <div className="gantt-row gantt-axis" role="row">
        <div className="gantt-label" role="columnheader">Category</div>
        <div className="gantt-track" role="columnheader">
          {hours.map(h => <span key={h} className="gantt-hour" style={{ left: pct(h) }}>{fromMinutes(h)}</span>)}
        </div>
      </div>

      {order.map((k, gi) => {
        const group = items.filter(i => i.kind === k)
        if (!group.length) return null
        const mins = group.reduce((n, i) => n + toMinutes(i.end) - toMinutes(i.start), 0)
        const open = !collapsed.has(k)
        return (
          <div key={k} className="gantt-group rise" style={{ '--i': gi, '--kind': `var(--kind-${k})` } as CSSProperties} role="rowgroup">
            <div className="gantt-row gantt-group-head" role="row">
              <div className="gantt-label" role="rowheader">
                <button type="button" className="gantt-toggle" aria-expanded={open} onClick={() => toggle(k)}>
                  <span className="gantt-chev" aria-hidden><Icon name="chevronDown" size={14} /></span>
                  <KindIcon kind={k} size={14} />
                  <span className="gantt-name">{kindMeta[k].plural}</span>
                </button>
                <span className="gantt-total">{formatDuration(mins)}</span>
              </div>
              <div className="gantt-track" role="cell">
                <div className="gantt-share" aria-label={`${Math.round((mins / planned) * 100)}% of planned time`}>
                  <span style={{ width: `${(mins / planned) * 100}%` }} />
                </div>
                {!open && group.map(i => (
                  <span key={i.id} className="gantt-ghost" style={{ left: pct(toMinutes(i.start)), width: `${((toMinutes(i.end) - toMinutes(i.start)) / total) * 100}%` }} />
                ))}
              </div>
            </div>

            {open && group.map(i => {
              const s = toMinutes(i.start)
              const d = toMinutes(i.end) - s
              return (
                <div key={i.id} className={`gantt-row${i.id === currentId ? ' is-now' : ''}${i.task?.state === 'completed' ? ' is-done' : ''}`} role="row" style={{ viewTransitionName: `g-${i.id}` } as CSSProperties}>
                  <div className="gantt-label gantt-item-label" role="rowheader">
                    <span className="truncate">{i.title}</span>
                  </div>
                  <div className="gantt-track" role="cell">
                    <span
                      className="gantt-bar"
                      style={{ left: pct(s), width: `${(d / total) * 100}%` }}
                      title={`${i.title} · ${i.start}–${i.end}`}
                    >
                      <span className="gantt-bar-text">{formatDuration(d)}</span>
                    </span>
                    <span className="visually-hidden">{i.start} to {i.end}, {formatDuration(d)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {nowMin >= start && nowMin <= end && (
        <div className="gantt-now-wrap" aria-hidden>
          <div className="gantt-now" style={{ left: pct(nowMin) }} />
        </div>
      )}
    </div>
  )
}
