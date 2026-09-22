import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { playAudio } from '../lib/audio'
import type { Task } from '../lib/types'
import { Icon } from './Icon'

const WORK = 25 * 60
const BREAK = 5 * 60
const FACE = 60 * 60 // dial face shows 60 minutes, like a kitchen timer
const IDLE_MS = 2500

type Phase = 'work' | 'break'

/* Focus mode: the rest of the app fades away and is made inert (native modal <dialog>),
   leaving one task and a tactile Pomodoro dial. The cursor hides while you are still
   and returns the moment you move, so Pause and Leave are always reachable. */
export function FocusMode({
  task, open, onPause, onResume, onComplete, onLeave,
}: {
  task?: Task
  open: boolean
  onPause: () => void
  onResume: () => void
  onComplete: () => void
  onLeave: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(null)
  const idleTimer = useRef<number>(0)
  const [phase, setPhase] = useState<Phase>('work')
  const [round, setRound] = useState(1)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [left, setLeft] = useState(WORK)
  const [winding, setWinding] = useState(true)
  const [idle, setIdle] = useState(false)
  const [armed, setArmed] = useState(false)

  const running = endsAt !== null

  // Open/close the native modal; mark <html> so the app behind can fade out.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const root = document.documentElement
    if (open && !d.open) {
      opener.current = document.activeElement
      setPhase('work'); setRound(1); setLeft(WORK)
      setWinding(true)
      setArmed(false)
      d.showModal()
      requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)))
      root.dataset.focus = 'on'
      // Wind the dial up from zero, then start ticking once it settles.
      const t = window.setTimeout(() => { setWinding(false); setEndsAt(Date.now() + WORK * 1000) }, 1100)
      return () => clearTimeout(t)
    }
    if (!open && d.open) {
      d.close()
      delete root.dataset.focus
      setEndsAt(null)
      setArmed(false)
      ;(opener.current as HTMLElement | null)?.focus?.()
    }
  }, [open])

  useEffect(() => () => { delete document.documentElement.dataset.focus }, [])

  // Tick.
  useEffect(() => {
    if (endsAt === null) return
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining === 0) {
        playAudio('beep')
        const next: Phase = phase === 'work' ? 'break' : 'work'
        const len = next === 'work' ? WORK : BREAK
        if (next === 'work') setRound(r => r + 1)
        setPhase(next)
        setLeft(len)
        setEndsAt(Date.now() + len * 1000)
      }
    }, 250)
    return () => clearInterval(t)
  }, [endsAt, phase])

  // Hide the cursor and soften controls when the pointer is still.
  const wake = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS)
  }
  useEffect(() => {
    if (open) wake()
    return () => clearTimeout(idleTimer.current)
  }, [open])

  const toggle = () => {
    if (winding) return
    if (running) {
      setLeft(Math.max(0, Math.ceil((endsAt! - Date.now()) / 1000)))
      setEndsAt(null)
      onPause()
    } else {
      setEndsAt(Date.now() + left * 1000)
      onResume()
    }
  }

  const total = phase === 'work' ? WORK : BREAK
  const p = open && armed ? left / FACE : 0
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')

  return (
    <dialog
      ref={ref}
      className="focus-modal"
      aria-labelledby="focus-task"
      data-idle={idle && running ? 'true' : undefined}
      data-phase={phase}
      onCancel={e => { e.preventDefault(); onLeave() }}
      onPointerMove={wake}
      onKeyDown={e => {
        wake()
        if (e.key === ' ' && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); toggle() }
      }}
    >
      <div className="focus-inner">
        <p className="focus-kicker">
          <Icon name={phase === 'work' ? 'target' : 'coffee'} size={16} />
          {phase === 'work' ? `Focus · round ${round}` : 'Break · stand up, look away'}
        </p>
        <h2 id="focus-task" className="focus-task">{task?.title ?? 'Focus'}</h2>

        <div
          className={`pomo${winding ? ' is-winding' : ''}${running ? ' is-running' : ''}`}
          style={{ '--p': p } as CSSProperties}
          aria-hidden
        >
          <div className="pomo-bezel">
            <div className="pomo-face">
              <div className="pomo-wedge" />
              <svg className="pomo-ticks" viewBox="0 0 200 200">
                {Array.from({ length: 60 }, (_, i) => {
                  const major = i % 5 === 0
                  const a = (i / 60) * Math.PI * 2
                  const r1 = major ? 80 : 84
                  return (
                    <line
                      key={i}
                      x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1}
                      x2={100 + Math.sin(a) * 90} y2={100 - Math.cos(a) * 90}
                      className={major ? 'major' : ''}
                    />
                  )
                })}
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2
                  return (
                    <text key={i} x={100 + Math.sin(a) * 68} y={100 - Math.cos(a) * 68 + 4} textAnchor="middle">{i * 5}</text>
                  )
                })}
              </svg>
              <div className="pomo-knob"><span className="pomo-grip" /></div>
            </div>
          </div>
        </div>

        <div className="pomo-readout" role="timer" aria-label={`${Math.ceil(left / 60)} minutes left in this ${phase === 'work' ? 'focus round' : 'break'}`}>
          {mm}:{ss}
          <span className="pomo-of">of {total / 60}:00</span>
        </div>

        <div className="focus-controls">
          <button type="button" className="btn btn-primary btn-lg" onClick={toggle} autoFocus>
            <Icon name={running ? 'pause' : 'play'} size={18} />{running ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="btn btn-lg" onClick={onComplete}>
            <Icon name="check" size={18} />Done
          </button>
          <button type="button" className="btn btn-quiet btn-lg" onClick={onLeave}>
            <Icon name="close" size={18} />Leave focus
          </button>
        </div>
        <p className="focus-hint"><kbd>Space</kbd> pause · <kbd>Esc</kbd> leave</p>
      </div>
    </dialog>
  )
}
