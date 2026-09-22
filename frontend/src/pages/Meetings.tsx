import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Modal, PrivateChip, Segmented } from '../components/ui'
import { playAudio } from '../lib/audio'
import { useStore } from '../lib/store'
import { addMinutes, formatDuration, toMinutes } from '../lib/time'
import type { MeetingPlan } from '../lib/types'

type Phase = 'prepare' | 'focus' | 'follow'

const planFields: { key: keyof MeetingPlan; label: string; ask: string }[] = [
  { key: 'purpose', label: 'Purpose', ask: 'what the purpose of the meeting is' },
  { key: 'outcome', label: 'Desired outcome', ask: 'what outcome or decision we are aiming for' },
  { key: 'role', label: 'My role', ask: 'what my role in the meeting is' },
  { key: 'contribution', label: 'Expected contribution', ask: 'what you would like me to contribute' },
  { key: 'decisionOwner', label: 'Decision owner', ask: 'who will make the final decision' },
  { key: 'materials', label: 'Materials', ask: 'whether there is anything I should read beforehand' },
  { key: 'prep', label: 'My preparation', ask: '' },
]

const prompts = [
  'Could we clarify what decision needs to be made by the end of this meeting?',
  'What is the one thing you need from me to keep this moving forward?',
  'I’d like to take a minute to review what we’ve agreed on before we close.',
  'Let me follow up with an email on that question by tomorrow morning.',
]

export default function Meetings() {
  const { meetings } = useStore()
  const [selected, setSelected] = useState(meetings[1]?.id ?? meetings[0]?.id)
  const [phase, setPhase] = useState<Phase>('prepare')
  const meeting = meetings.find(m => m.id === selected) ?? meetings[0]
  if (!meeting) return <div className="page"><div className="glass card empty"><p>No meetings today.</p></div></div>
  const length = toMinutes(meeting.end) - toMinutes(meeting.start)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Meetings</h1>
          <p>Know why you’re there, what’s expected, and what happens after.</p>
        </div>
        <Segmented<Phase>
          label="Meeting phase"
          value={phase}
          onChange={setPhase}
          options={[{ value: 'prepare', label: 'Before' }, { value: 'focus', label: 'During' }, { value: 'follow', label: 'After' }]}
        />
      </div>

      <div className="grid grid-split" style={{ gridTemplateColumns: 'minmax(0, 300px) minmax(0, 1fr)' }}>
        <section className="glass card rise" aria-labelledby="mtg-list-h">
          <h2 id="mtg-list-h" style={{ fontSize: 'var(--fs-lg)', marginBottom: 'var(--s4)' }}>Today</h2>
          <ul className="meeting-list">
            {meetings.map(m => {
              const missing = planFields.filter(f => f.ask && !(m[f.key] as string)).length
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="meeting-btn"
                    aria-current={m.id === selected}
                    onClick={() => { playAudio('tack'); setSelected(m.id) }}
                  >
                    <span className="row-between">
                      <span className="time">{m.start}–{m.end}</span>
                      {missing > 0 ? <span className="badge badge-warn">{missing} missing</span> : <span className="badge badge-ok">Clear</span>}
                    </span>
                    <strong>{m.title}</strong>
                    <span className="faint">Organizer: {m.organizer}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <div key={meeting.id + phase} className="stack fade">
          {phase === 'prepare' && <Prepare meeting={meeting} length={length} />}
          {phase === 'focus' && <Focus meeting={meeting} />}
          {phase === 'follow' && <FollowUp meeting={meeting} />}
        </div>
      </div>
    </div>
  )
}

function Prepare({ meeting, length }: { meeting: MeetingPlan; length: number }) {
  const { updateMeeting, addTask, notify, prefs } = useStore()
  const missing = planFields.filter(f => f.ask && !(meeting[f.key] as string))
  const firstName = meeting.organizer.split(' ')[0]
  const [request, setRequest] = useState(() => buildRequest(firstName, meeting.title, missing.map(m => m.ask)))

  const schedulePrep = () => {
    addTask({
      title: `Prepare for ${meeting.title}`,
      minutes: 20,
      source: `Meeting: ${meeting.title}`,
      why: meeting.prep || 'Read materials and note your contribution.',
    })
    notify(`Preparation added to your tray, with a ${prefs.bufferMinutes}-minute transition buffer when placed`)
  }

  return (
    <>
      <section className="glass card stack rise" aria-labelledby="plan-h">
        <div className="row-between">
          <div>
            <h2 id="plan-h" style={{ fontSize: 'var(--fs-lg)' }}>{meeting.title}</h2>
            <p className="faint">{meeting.start}–{meeting.end} · {formatDuration(length)} · Organizer: {meeting.organizer}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={schedulePrep}>
            <Icon name="calendar" size={18} />Add preparation time
          </button>
        </div>
        <div className="plan-grid">
          {planFields.map(f => {
            const value = meeting[f.key] as string
            const isMissing = !!f.ask && !value
            return (
              <div key={f.key} className={`glass-inset plan-field${isMissing ? ' is-missing' : ''}`}>
                <div className="row-between">
                  <label htmlFor={`pf-${f.key}`}>{f.label}</label>
                  {isMissing && <span className="badge badge-warn">Not stated</span>}
                </div>
                <input
                  id={`pf-${f.key}`}
                  type="text"
                  className="input-inline"
                  value={value}
                  placeholder={isMissing ? 'Not in the invitation. Add it or ask.' : ''}
                  onChange={e => updateMeeting(meeting.id, { [f.key]: e.target.value })}
                />
              </div>
            )
          })}
        </div>
      </section>

      {missing.length > 0 && (
        <section className="glass card stack rise" style={{ '--i': 1 } as CSSProperties} aria-labelledby="ask-h">
          <div className="row-between">
            <h3 id="ask-h" className="h-sm"><Icon name="question" />Ask {firstName} for the missing details</h3>
            <span className="badge badge-info">Not sent</span>
          </div>
          <label htmlFor="req" className="visually-hidden">Message to organizer</label>
          <textarea id="req" rows={6} value={request} onChange={e => setRequest(e.target.value)} />
          <div className="row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                navigator.clipboard?.writeText(request).then(
                  () => notify('Message copied. It has not been sent.'),
                  () => notify('Copy was blocked by the browser')
                )
              }
            >
              <Icon name="copy" size={16} />Copy message
            </button>
          </div>
        </section>
      )}
    </>
  )
}

function buildRequest(name: string, title: string, asks: string[]) {
  if (!asks.length) return ''
  const list = asks.map(a => `• ${a.charAt(0).toUpperCase()}${a.slice(1)}`).join('\n')
  return `Hi ${name},\n\nThanks for the invitation to “${title}”. To prepare well, could you let me know:\n\n${list}\n\nThank you!`
}

function Focus({ meeting }: { meeting: MeetingPlan }) {
  const { updateMeeting, notify } = useStore()
  const agenda = meeting.agenda.length ? meeting.agenda : [{ id: 'x', title: meeting.title, minutes: toMinutes(meeting.end) - toMinutes(meeting.start) }]
  const [idx, setIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const [left, setLeft] = useState(agenda[0].minutes * 60)
  const [parking, setParking] = useState('')
  const item = agenda[idx]

  useEffect(() => { setLeft(agenda[idx].minutes * 60) }, [idx]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])

  const total = item.minutes * 60
  const r = 80
  const circ = 2 * Math.PI * r
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  const record = (kind: 'decisions' | 'actions' | 'questions') => {
    playAudio('tick')
    const label = { decisions: 'Decision', actions: 'Action', questions: 'Open question' }[kind]
    updateMeeting(meeting.id, { [kind]: [...meeting[kind], `${label} (${item.title}): `] })
    notify(`${label} added. Fill it in under After.`)
  }

  return (
    <>
      <section className="glass focus-stage rise" aria-labelledby="focus-h">
        <span className="faint">Item {idx + 1} of {agenda.length}</span>
        <h2 id="focus-h" className="focus-item">{item.title}</h2>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
          <svg className="ring" viewBox="0 0 180 180" aria-hidden>
            <circle className="ring-bg" cx="90" cy="90" r={r} />
            <circle className="ring-fg" cx="90" cy="90" r={r} strokeDasharray={circ} strokeDashoffset={circ * (1 - left / total)} />
          </svg>
          <div className="timer" style={{ position: 'absolute' }} role="timer" aria-label={`${Math.ceil(left / 60)} minutes remaining`}>{mm}:{ss}</div>
        </div>
        <div className="agenda-steps" aria-hidden>
          {agenda.map((a, i) => <span key={a.id} className={i < idx ? 'done' : i === idx ? 'current' : ''} />)}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn" disabled={idx === 0} onClick={() => { playAudio('tack'); setIdx(i => i - 1) }}>Previous item</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => { playAudio(running ? 'boop' : 'beep'); setRunning(r => !r) }}>
            <Icon name={running ? 'pause' : 'play'} size={18} />{running ? 'Pause timer' : 'Start timer'}
          </button>
          <button type="button" className="btn" disabled={idx === agenda.length - 1} onClick={() => { playAudio('tack'); setIdx(i => i + 1) }}>Next item<Icon name="arrowRight" size={16} /></button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 'var(--s2)' }} role="group" aria-label="Record">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => record('decisions')}><Icon name="check" size={15} />Decision</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => record('actions')}><Icon name="task" size={15} />Action</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => record('questions')}><Icon name="question" size={15} />Question</button>
        </div>
        <p className="faint">The timer is only a guide. Ends at {addMinutes(meeting.start, agenda.slice(0, idx + 1).reduce((n, a) => n + a.minutes, 0))}.</p>
      </section>

      <div className="grid grid-2">
        <section className="glass card stack-sm rise" style={{ '--i': 1 } as CSSProperties}>
          <div className="row-between"><h3 className="h-sm"><Icon name="lock" />Private notes</h3><PrivateChip text="Only you" /></div>
          {meeting.prep && <p className="faint">Prep: {meeting.prep}</p>}
          <label htmlFor="pn" className="visually-hidden">Private notes</label>
          <textarea id="pn" rows={6} value={meeting.privateNotes} onChange={e => updateMeeting(meeting.id, { privateNotes: e.target.value })} placeholder="Anything you want to remember…" />
        </section>
        <section className="glass card stack-sm rise" style={{ '--i': 2 } as CSSProperties}>
          <h3 className="h-sm"><Icon name="sparkle" />Quick prompts</h3>
          <p className="faint">Phrases you can use or copy.</p>
          <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
            {prompts.map(p => (
              <li key={p}>
                <button type="button" className="btn btn-quiet" style={{ width: '100%', justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => navigator.clipboard?.writeText(p).then(() => notify('Prompt copied'), () => notify('Copy was blocked by the browser'))}>
                  <Icon name="copy" size={16} />{p}
                </button>
              </li>
            ))}
          </ul>
          <hr className="divider" />
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e: FormEvent) => { e.preventDefault(); if (!parking.trim()) return; updateMeeting(meeting.id, { parkingLot: [...meeting.parkingLot, parking.trim()] }); setParking('') }}>
            <label htmlFor="pk" className="visually-hidden">Parking lot</label>
            <input id="pk" type="text" value={parking} onChange={e => setParking(e.target.value)} placeholder="Park an unrelated topic…" />
            <button type="submit" className="btn">Park it</button>
          </form>
          {meeting.parkingLot.length > 0 && <ul className="small">{meeting.parkingLot.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        </section>
      </div>
    </>
  )
}

function FollowUp({ meeting }: { meeting: MeetingPlan }) {
  const { updateMeeting, addTask, notify, tasks } = useStore()
  const navigate = useNavigate()
  const [taskReview, setTaskReview] = useState<string[] | null>(null)
  const cols: { key: 'decisions' | 'actions' | 'questions'; title: string; badge: string; icon: IconName }[] = [
    { key: 'decisions', title: 'Decisions', badge: 'badge-ok', icon: 'check' },
    { key: 'actions', title: 'Actions', badge: 'badge-accent', icon: 'task' },
    { key: 'questions', title: 'Open questions', badge: 'badge-warn', icon: 'question' },
  ]
  const [reviewed, setReviewed] = useState(false)

  const addActions = () => {
    const actions = [...new Set(meeting.actions.filter(a => a.trim() && !a.trim().endsWith(':')).map(a => a.replace(/^Action \([^)]*\):\s*/, '').trim()))]
      .filter(title => !tasks.some(task => task.title === title && task.source === `Meeting: ${meeting.title}`))
    if (!actions.length) {
      notify('No new actions to add. Write an action first, or check Today.')
      return
    }
    setTaskReview(actions)
  }

  const confirmActions = () => {
    const actions = taskReview ?? []
    actions.forEach(title => addTask({ title, minutes: 30, source: `Meeting: ${meeting.title}` }))
    setTaskReview(null)
    playAudio('complete')
    notify(`Added ${actions.length} action${actions.length > 1 ? 's' : ''} to Unscheduled`, {
      label: 'View Today',
      run: () => navigate('/'),
    })
  }

  const summary = [
    `Summary: ${meeting.title}`,
    ...cols.flatMap(c => [`\n${c.title}:`, ...(meeting[c.key].length ? meeting[c.key].map(x => `• ${x}`) : ['• None recorded'])]),
  ].join('\n')

  return (
    <>
      <Modal open={taskReview !== null} onClose={() => setTaskReview(null)} title="Review actions for Today">
        <p className="muted">Choose the actions that belong to you. These will be added to Unscheduled with a 30-minute estimate; nothing is added to your external calendar.</p>
        <ul className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
          {taskReview?.map((title, index) => (
            <li key={index} className="row-between">
              <span>{title}</span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setTaskReview(items => items?.filter((_, i) => i !== index) ?? null)}
                aria-label={`Exclude ${title}`}
              >
                Exclude
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-foot">
          <button type="button" className="btn btn-quiet" onClick={() => setTaskReview(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!taskReview?.length} onClick={confirmActions}>
            Add {taskReview?.length ?? 0} to Today
          </button>
        </div>
      </Modal>

      <div className="grid grid-3">
        {cols.map((c, ci) => (
          <section key={c.key} className="glass output-col rise" style={{ '--i': ci } as CSSProperties}>
            <div className="row-between">
              <h3 className="h-sm"><Icon name={c.icon} />{c.title}</h3>
              <span className={`badge ${c.badge}`}>{meeting[c.key].length}</span>
            </div>
            <ul>
              {meeting[c.key].map((x, i) => (
                <li key={i} className="glass-inset row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    type="text"
                    className="input-inline"
                    aria-label={`${c.title} ${i + 1}`}
                    value={x}
                    onChange={e => updateMeeting(meeting.id, { [c.key]: meeting[c.key].map((y, j) => (j === i ? e.target.value : y)) })}
                  />
                  <button
                    type="button"
                    className="btn btn-quiet icon-btn btn-sm"
                    aria-label={`Remove ${c.title.toLowerCase()} ${i + 1}`}
                    onClick={() => updateMeeting(meeting.id, { [c.key]: meeting[c.key].filter((_, j) => j !== i) })}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => updateMeeting(meeting.id, { [c.key]: [...meeting[c.key], ''] })}
              >
                <Icon name="plus" size={15} />Add
              </button>
            </div>
          </section>
        ))}
      </div>

      <section className="glass card stack rise" style={{ '--i': 3 } as CSSProperties}>
        <div className="row-between">
          <h3 className="h-sm"><Icon name="eye" />Review before sharing</h3>
          <PrivateChip text="Private notes are never included" />
        </div>
        <pre className="glass-inset source-text" style={{ margin: 0, fontFamily: 'inherit' }}>{summary}</pre>
        <label className="row" style={{ fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={e => setReviewed(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          I have reviewed this summary and it is accurate
        </label>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!reviewed}
            onClick={() =>
              navigator.clipboard?.writeText(summary).then(
                () => notify('Summary copied to share'),
                () => notify('Copy was blocked by the browser')
              )
            }
          >
            <Icon name="copy" size={18} />Copy summary to share
          </button>
          <button type="button" className="btn" onClick={addActions}>
            <Icon name="inbox" size={18} />Add actions to tray
          </button>
        </div>
      </section>
    </>
  )
}
