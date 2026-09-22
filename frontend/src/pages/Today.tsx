import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { GanttView, KanbanView, KindIcon, ZoomTimeline } from '../components/DayViews'
import type { Column, Item } from '../components/DayViews'
import { FocusMode } from '../components/FocusMode'
import { ToolButton } from '../components/Toolbar'
import { Disclose, Modal } from '../components/ui'
import { playAudio } from '../lib/audio'
import { busyFrom, findSlot } from '../lib/schedule'
import { useStore } from '../lib/store'
import { useLocalState } from '../lib/local-state'
import { addMinutes, formatDuration, fromMinutes, nowMinutes, toMinutes } from '../lib/time'
import type { Task, TaskState, TodayView } from '../lib/types'

const stateLabel: Record<TaskState, string> = {
  planned: 'Planned', ready: 'Ready', in_progress: 'In progress', paused: 'Paused',
  completed: 'Completed', rescheduled: 'Rescheduled', returned: 'Returned to plan',
}

const activeStates: TaskState[] = ['in_progress', 'paused', 'ready', 'planned', 'returned']
type OverviewPanel = 'next' | 'tray' | 'day'

function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set(x => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

const workedSeconds = (t: Task) => (t.elapsed ?? 0) + (t.startedAt ? (Date.now() - t.startedAt) / 1000 : 0)

export default function Today() {
  const { tasks, blocks, prefs, setPrefs, setTasks, updateTask, notify, setCaptureOpen } = useStore()
  const navigate = useNavigate()
  const latestTasks = useRef(tasks)
  latestTasks.current = tasks
  const [pausing, setPausing] = useState<Task | null>(null)
  const [focusing, setFocusing] = useState(false)
  const [openPanel, setOpenPanel] = useLocalState<OverviewPanel | null>('clarity.today.panel', null)
  const dayOpen = openPanel === 'day'
  const trayOpen = openPanel === 'tray'
  const nextOpen = openPanel === 'next'
  const view: TodayView = (['kanban', 'timeline', 'gantt'] as const).includes(prefs.todayView) ? prefs.todayView : 'kanban'
  useTick(1000)

  const scheduled = tasks.filter(t => t.start && activeStates.includes(t.state))
  const now =
    scheduled.find(t => t.state === 'in_progress') ??
    scheduled.find(t => t.state === 'paused') ??
    [...scheduled].sort((a, b) => toMinutes(a.start!) - toMinutes(b.start!))[0]

  const items: Item[] = useMemo(() => {
    const fromTasks: Item[] = tasks
      .filter(t => t.start && t.state !== 'rescheduled')
      .map(t => ({ id: t.id, title: t.title, start: t.start!, end: addMinutes(t.start!, t.minutes), kind: 'task', task: t }))
    return [...blocks.map(b => ({ ...b })), ...fromTasks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  }, [tasks, blocks])

  const nowMin = nowMinutes()
  const upNext = items
    .filter(i => i.id !== now?.id && i.kind !== 'buffer' && i.task?.state !== 'completed')
    .filter(i => (i.kind === 'task' ? true : toMinutes(i.end) > nowMin))
    .slice(0, 2)

  const tray = tasks.filter(t => !t.start && t.state !== 'completed')

  const changeWithUndo = (changes: { task: Task; patch: Partial<Task> }[], message: string) => {
    const next = changes.map(({ task, patch }) => ({ ...task, ...patch }))
    const previous = changes.map(({ task }) => task.state === 'in_progress' ? { ...task, elapsed: Math.round(workedSeconds(task)) } : task)
    setTasks(current => current.map(task => next.find(t => t.id === task.id) ?? task))
    notify(message, { label: 'Undo', run: () => {
      // Do not overwrite edits made after this action.
      if (!next.every(expected => latestTasks.current.some(task => task.id === expected.id && JSON.stringify(task) === JSON.stringify(expected)))) {
        notify('This task changed again, so the earlier action cannot be undone.')
        return
      }
      setTasks(current => current.map(task => {
        const index = next.findIndex(t => t.id === task.id && JSON.stringify(t) === JSON.stringify(task))
        if (index < 0) return task
        return previous[index].state === 'in_progress' ? { ...previous[index], startedAt: Date.now() } : previous[index]
      }))
    } })
  }

  const placeOnPlan = (t: Task) => {
    const slot = findSlot(busyFrom(tasks, blocks), t.minutes, prefs.bufferMinutes)
    if (slot == null) {
      playAudio('alert')
      notify('No free slot left today')
      return
    }
    const start = fromMinutes(slot)
    changeWithUndo([{ task: t, patch: { start, state: t.state === 'rescheduled' ? 'returned' : 'planned' } }], `Placed at ${start}`)
    playAudio('tack')
  }

  const start = (t: Task) => {
    updateTask(t.id, { state: 'in_progress', startedAt: Date.now() })
    playAudio('beep')
    notify('Task started. Enter Focus whenever you’re ready.')
  }
  const pauseQuietly = (t: Task) => updateTask(t.id, { state: 'paused', startedAt: undefined, elapsed: Math.round(workedSeconds(t)) })
  const resumeQuietly = (t: Task) => updateTask(t.id, { state: 'in_progress', startedAt: Date.now() })
  const complete = (t: Task) => {
    changeWithUndo([{ task: t, patch: { state: 'completed', startedAt: undefined, elapsed: Math.round(workedSeconds(t)) } }], 'Marked complete')
    playAudio('complete')
  }
  const reschedule = (t: Task) => {
    changeWithUndo([{ task: t, patch: { state: 'rescheduled', start: undefined, startedAt: undefined, elapsed: Math.round(workedSeconds(t)) } }], 'Moved to unscheduled')
    playAudio('boop')
  }

  const running = now?.state === 'in_progress'
  const paused = now?.state === 'paused'

  const moveTask = (t: Task, to: Column) => {
    if (to === 'done') { complete(t); return }
    if (to === 'doing') {
      changeWithUndo([
        ...tasks.filter(x => x.state === 'in_progress' && x.id !== t.id).map(task => ({ task, patch: { state: 'paused' as const, startedAt: undefined, elapsed: Math.round(workedSeconds(task)) } })),
        { task: t, patch: { state: 'in_progress', startedAt: Date.now() } },
      ], `Doing: ${t.title}`)
      playAudio('tack')
      return
    }
    changeWithUndo([{ task: t, patch: { state: 'planned', startedAt: undefined, elapsed: Math.round(workedSeconds(t)) } }], `Back to To do: ${t.title}`)
    playAudio('tack')
  }

  const views: { v: TodayView; icon: IconName; label: string }[] = [
    { v: 'kanban', icon: 'kanban', label: 'Kanban board' },
    { v: 'timeline', icon: 'timeline', label: 'Zoomable timeline' },
    { v: 'gantt', icon: 'gantt', label: 'Gantt by category' },
  ]
  const counts = { meetings: items.filter(i => i.kind === 'meeting').length, tasks: items.filter(i => i.kind === 'task' && i.task?.state !== 'completed').length }
  const togglePanel = (panel: OverviewPanel) => setOpenPanel(current => current === panel ? null : panel)

  return (
    <div className="page">
      <NowCard task={now}>
        {now ? <div className="now-actions" role="group" aria-label="Current task actions">
          <button type="button" className="btn btn-primary" onClick={() => running ? setPausing(now) : start(now)}><Icon name={running ? 'pause' : 'play'} size={18} />{running ? 'Pause' : paused ? 'Resume' : 'Start'}</button>
          {running && <button type="button" className="btn" onClick={() => setFocusing(true)}><Icon name="focus" size={18} />Focus</button>}
          <button type="button" className="btn btn-quiet" onClick={() => complete(now)}><Icon name="check" size={18} />Done</button>
          <button type="button" className="btn btn-quiet" onClick={() => reschedule(now)}><Icon name="reschedule" size={18} />Later</button>
          <button type="button" className="btn btn-quiet" onClick={() => navigate('/guide', { state: { taskId: now.id } })}><Icon name="sparkle" size={18} />Ask Guide</button>
        </div> : <button type="button" className="btn btn-primary" onClick={() => tray.length ? setOpenPanel('tray') : setCaptureOpen(true)}>{tray.length ? 'Choose a task' : 'Capture a task'}</button>}
      </NowCard>

      <section
        className={`today-overview glass rise${openPanel ? ` is-open is-${openPanel}` : ''}`}
        style={{ '--i': 2 } as CSSProperties}
        aria-label="Today overview"
      >
        <div className="today-overview-tabs">
          <button type="button" className="today-overview-tab" aria-expanded={nextOpen} aria-controls="next-body" onClick={() => togglePanel('next')}>
            <span className="overview-tab-icon"><Icon name="skip" size={18} /></span>
            <span className="overview-tab-copy"><strong>Up next</strong><small>{upNext[0]?.title ?? 'Nothing else planned'}</small></span>
            <span className="overview-tab-meta">{upNext[0]?.start ?? 'Clear'}</span>
            <span className="overview-tab-chev" aria-hidden><Icon name="chevronDown" size={15} /></span>
          </button>

          <button type="button" className="today-overview-tab" aria-expanded={trayOpen} aria-controls="tray-body" onClick={() => togglePanel('tray')}>
            <span className="overview-tab-icon"><Icon name="inbox" size={18} /></span>
            <span className="overview-tab-copy"><strong>Unscheduled</strong><small>{tray.length === 1 ? '1 task waiting' : `${tray.length} tasks waiting`}</small></span>
            <span className="overview-count" aria-label={`${tray.length} unscheduled tasks`}>{tray.length}</span>
            <span className="overview-tab-chev" aria-hidden><Icon name="chevronDown" size={15} /></span>
          </button>

          <button type="button" className="today-overview-tab" aria-expanded={dayOpen} aria-controls="day-body" onClick={() => togglePanel('day')}>
            <span className="overview-tab-icon"><Icon name="calendar" size={18} /></span>
            <span className="overview-tab-copy"><strong>Your day</strong><small>{counts.meetings} meetings · {counts.tasks} tasks</small></span>
            <span className="overview-count" aria-label={`${counts.meetings} meetings and ${counts.tasks} tasks`}>{counts.meetings + counts.tasks}</span>
            <span className="overview-tab-chev" aria-hidden><Icon name="chevronDown" size={15} /></span>
          </button>
        </div>

        <div className="today-overview-details">
          <Disclose open={nextOpen} id="next-body">
            <div className="overview-detail" aria-labelledby="next-detail-h">
              <div className="overview-detail-head"><h2 id="next-detail-h">Coming up</h2><span>{upNext.length} planned</span></div>
              {upNext.length === 0 ? (
                <p className="muted">Nothing else today.</p>
              ) : (
                <ol className="up-next">
                  {upNext.map((item, index) => (
                    <li key={item.id} className={`glass-inset${index === 0 ? ' is-first' : ''}`}>
                      <KindIcon kind={item.kind} size={index === 0 ? 20 : 16} />
                      <span style={{ minWidth: 0 }}><span className="up-title">{item.title}</span></span>
                      <span className="up-time"><span className="time">{item.start}</span><span className="faint">{formatDuration(toMinutes(item.end) - toMinutes(item.start))}</span></span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Disclose>

          <Disclose open={trayOpen} id="tray-body">
            <div className="overview-detail" aria-labelledby="tray-detail-h">
              <div className="overview-detail-head"><h2 id="tray-detail-h">Unscheduled tasks</h2><span>{tray.length} waiting</span></div>
              {tray.length === 0 ? (
                <p className="muted">Tray is empty.</p>
              ) : (
                <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
                  {tray.map(task => (
                    <li key={task.id} className="tray-item glass-inset">
                      <span className="row" style={{ flexWrap: 'nowrap', minWidth: 0, gap: 'var(--s2)' }}>
                        <Icon name={task.state === 'rescheduled' ? 'reschedule' : 'task'} size={16} />
                        <span className="truncate">{task.title}</span>
                      </span>
                      <span className="row" style={{ flexWrap: 'nowrap', gap: 'var(--s2)' }}>
                        <span className="faint">{task.minutes}m</span>
                        <button
                          type="button"
                          className="btn btn-quiet icon-btn btn-sm"
                          data-tip={task.state === 'rescheduled' ? 'Return to plan' : 'Place on plan'}
                          aria-label={`${task.state === 'rescheduled' ? 'Return to plan' : 'Place on plan'}: ${task.title}`}
                          onClick={() => placeOnPlan(task)}
                        >
                          <Icon name="calendar" size={16} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Disclose>

          <Disclose open={dayOpen} id="day-body">
            <div className="overview-detail day-body" aria-labelledby="day-detail-h">
              <div className="overview-detail-head"><h2 id="day-detail-h">Your day</h2><span>{counts.meetings} meetings · {counts.tasks} tasks</span></div>
              <div role="radiogroup" aria-label="Day view" className="day-view-controls">
                {views.map(v => <ToolButton key={v.v} icon={v.icon} label={v.label} short={v.v === 'kanban' ? 'Board' : v.v === 'timeline' ? 'Timeline' : 'Gantt'} role="radio" checked={view === v.v} onClick={() => setPrefs({ todayView: v.v })} />)}
              </div>
              {dayOpen ? (
                <div key={view} className="fade">
                  {view === 'kanban' ? <KanbanView tasks={tasks} currentId={now?.id} onMove={moveTask} /> : null}
                  {view === 'timeline' ? <ZoomTimeline items={items} nowMin={nowMin} currentId={now?.id} /> : null}
                  {view === 'gantt' ? <GanttView items={items} nowMin={nowMin} currentId={now?.id} /> : null}
                </div>
              ) : null}
            </div>
          </Disclose>
        </div>
      </section>

      <FocusMode
        task={now}
        open={focusing && !!now}
        onPause={() => now && pauseQuietly(now)}
        onResume={() => now && resumeQuietly(now)}
        onComplete={() => { setFocusing(false); now && complete(now) }}
        onLeave={() => { setFocusing(false); if (now?.state === 'in_progress') setPausing(now) }}
      />
      <PauseDialog task={pausing} onClose={() => setPausing(null)} />
    </div>
  )
}

function NowCard({ task, children }: { task?: Task; children: ReactNode }) {
  if (!task) {
    return (
      <section className="glass now-card sticky-now rise" aria-labelledby="now-h">
        <span className="now-icon" aria-hidden><Icon name="coffee" size={22} /></span>
        <div>
          <div className="now-label" id="now-h">Now</div>
          <p className="now-title">Nothing planned. Take a break or place something from the tray.</p>
          {children}
        </div>
      </section>
    )
  }

  const active = task.state === 'in_progress' || task.state === 'paused'
  const pct = Math.min(100, (workedSeconds(task) / (task.minutes * 60)) * 100)
  const left = Math.max(0, Math.round(task.minutes - workedSeconds(task) / 60))

  return (
    <section className={`glass now-card sticky-now rise${task.state === 'in_progress' ? ' is-running' : ''}`} aria-labelledby="now-h">
      <span className="now-icon" aria-hidden>
        <Icon name={task.state === 'in_progress' ? 'target' : task.state === 'paused' ? 'pause' : 'play'} size={22} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="now-label" id="now-h">Now · {stateLabel[task.state]}</div>
        <h1 className="now-title">{task.title}</h1>
        {task.state === 'paused' && task.resumeNote
          ? <p className="now-sub truncate"><Icon name="flag" size={14} /> {task.resumeNote.replace(/\n/g, ' · ')}</p>
          : task.why && <p className="now-sub truncate">{task.why}</p>}
        {active && (
          <div className="progress" role="progressbar" aria-label="Time used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="now-time">
        <Icon name="clock" size={16} />
        <span>{active ? `${left}m left` : formatDuration(task.minutes)}</span>
      </div>
      {children}
    </section>
  )
}

function PauseDialog({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { updateTask, notify } = useStore()
  const [done, setDone] = useState('')
  const [left, setLeft] = useState('')
  const [open, setOpen] = useState('')

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!task) return
    const note = [done && `Done: ${done}`, left && `Left: ${left}`, open && `Open: ${open}`].filter(Boolean).join('\n')
    updateTask(task.id, { state: 'paused', startedAt: undefined, elapsed: Math.round(workedSeconds(task)), resumeNote: note || undefined })
    setDone(''); setLeft(''); setOpen('')
    playAudio('boop')
    onClose()
    notify('Paused. Note saved.')
  }

  return (
    <Modal open={!!task} onClose={onClose} title="Pause">
      <form className="stack" onSubmit={save}>
        <p className="muted small">Optional note for when you come back.</p>
        <div className="field">
          <label htmlFor="rn-done"><Icon name="check" size={14} /> Finished</label>
          <input id="rn-done" type="text" value={done} onChange={e => setDone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rn-left"><Icon name="list" size={14} /> Remaining</label>
          <input id="rn-left" type="text" value={left} onChange={e => setLeft(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rn-open"><Icon name="arrowRight" size={14} /> Open next</label>
          <input id="rn-open" type="text" value={open} onChange={e => setOpen(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Keep working</button>
          <button type="submit" className="btn btn-primary"><Icon name="pause" size={18} />Pause task</button>
        </div>
      </form>
    </Modal>
  )
}
