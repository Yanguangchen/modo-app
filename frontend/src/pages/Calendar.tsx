import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Modal, Segmented } from '../components/ui'
import { syncCalendarBlockToRobot } from '../lib/robotSync'
import { useStore } from '../lib/store'
import type { BlockKind } from '../lib/types'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: offset + days }, (_, i) => {
    const day = i - offset + 1
    return day > 0 ? day : null
  })
}

export default function Calendar() {
  const { blocks, prefs, addCalendarBlock, addTask, addNotification, notify } = useStore()
  const today = new Date()
  const [cursor, setCursor] = useState(() => new Date(2026, 8, 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [minutes, setMinutes] = useState(30)
  const [kind, setKind] = useState<BlockKind>('focus')
  const cells = useMemo(() => monthCells(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const monthLabel = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate())

  const saveBlock = async () => {
    if (!selectedDate || !title.trim()) return
    const [h, m] = start.split(':').map(Number)
    const endDate = new Date(2000, 0, 1, h, m + minutes)
    const end = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    const block = addCalendarBlock({ title: title.trim(), date: selectedDate, start, end, kind })
    addTask({ title: title.trim(), minutes, start, source: 'Monthly Calendar' })
    addNotification({
      title: 'Calendar block added',
      message: `${title.trim()} is scheduled for ${selectedDate} at ${start}.`,
      kind: 'reminder',
      priority: 'normal',
      blockId: block.id,
    })
    const synced = await syncCalendarBlockToRobot(block, prefs)
    notify(synced ? 'Added to calendar and synced to robot' : 'Added to calendar. Start backend to sync robot.')
    setSelectedDate(null)
    setTitle('')
    setStart('09:00')
    setMinutes(30)
    setKind('focus')
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Your month, at a glance</h1>
          <p>Plan one day at a time, with reminders ready for the assistant.</p>
        </div>
        <button type="button" className="btn" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
          <Icon name="today" size={18} />
          Today
        </button>
      </div>

      <section className="glass card calendar-shell">
        <div className="row-between calendar-toolbar">
          <div className="row">
            <span className="calendar-icon"><Icon name="calendar" /></span>
            <h2>{monthLabel}</h2>
          </div>
          <div className="row">
            <button type="button" className="btn btn-quiet icon-btn" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <Icon name="chevronLeft" />
            </button>
            <span className="badge">{String(cursor.getMonth() + 1).padStart(2, '0')}/{cursor.getFullYear()}</span>
            <button type="button" className="btn btn-quiet icon-btn" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>

        <div className="month-grid" role="grid" aria-label={monthLabel}>
          {weekdays.map(day => <div key={day} className="month-weekday">{day}</div>)}
          {cells.map((day, i) => {
            if (!day) return <div key={`blank-${i}`} className="month-cell is-empty" />
            const date = isoDate(cursor.getFullYear(), cursor.getMonth(), day)
            const dayBlocks = blocks.filter(b => (b.date ?? todayIso) === date)
            return (
              <button key={date} type="button" className={`month-cell${date === todayIso ? ' is-today' : ''}`} onClick={() => setSelectedDate(date)}>
                <span className="month-day">{day}</span>
                <span className="month-items">
                  {dayBlocks.slice(0, 3).map(block => (
                    <span key={block.id} className={`month-chip is-${block.kind}`}>
                      {block.start} {block.title}
                    </span>
                  ))}
                  {dayBlocks.length > 3 && <span className="faint">+{dayBlocks.length - 3} more</span>}
                </span>
                <span className="month-add">+ Add task</span>
              </button>
            )
          })}
        </div>
      </section>

      <Modal open={Boolean(selectedDate)} onClose={() => setSelectedDate(null)} title="Add calendar block">
        <div className="stack">
          <div className="field">
            <label htmlFor="event-title">Title</label>
            <input id="event-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Coffee, Big Data, meeting..." />
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="event-start">Start</label>
              <input id="event-start" type="time" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="event-minutes">Duration</label>
              <input id="event-minutes" type="number" min={5} step={5} value={minutes} onChange={e => setMinutes(Math.max(5, Number(e.target.value) || 5))} />
            </div>
          </div>
          <Segmented
            label="Block kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'focus', label: 'Focus' },
              { value: 'meeting', label: 'Meeting' },
              { value: 'break', label: 'Break' },
              { value: 'buffer', label: 'Buffer' },
            ]}
          />
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setSelectedDate(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!title.trim()} onClick={saveBlock}>
              <Icon name="plus" size={18} />
              Add block
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
