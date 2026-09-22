import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Disclose, PrivateChip, Segmented } from '../components/ui'
import { playAudio } from '../lib/audio'
import { analyse, draftMessage, example, modes } from '../lib/clarify'
import type { Analysis, Mode, Sourced, Step } from '../lib/clarify'
import { busyFrom, propose, strategies } from '../lib/schedule'
import type { Strategy } from '../lib/schedule'
import { ApiError, aiDemoMode, api, apiPost } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { formatDuration, fromMinutes, uid } from '../lib/time'

const DEMO = aiDemoMode(import.meta.env.VITE_CLARIFY_DEMO_MODE)
const THREAD_KEY = 'clarity.clarify.thread'
const DRAFT_KEY = 'clarity.draft.clarify'
const load = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}

const modeIcon: Record<Mode, IconName> = {
  explicit: 'eye', breakdown: 'list', say: 'message', cards: 'grid', mindmap: 'mindmap', conversation: 'users',
}

type SayOpts = Parameters<typeof draftMessage>[1]

interface UserMsg { id: string; role: 'user'; text: string; mode: Mode; followUpOf?: string }
interface AiMsg {
  id: string; role: 'assistant'; source: string; mode: Mode; opts: SayOpts
  status: 'working' | 'done' | 'error'; result?: Analysis; history: Analysis[]
  error?: { code: string; message: string }
  /** 'ai' when Gemini produced it, 'rules' for the offline fallback. */
  engine?: 'ai' | 'rules'
  /** Server transformation id, so edits and reports reach the account. */
  tid?: string
}
type Msg = UserMsg | AiMsg

/* Clarify as a conversation. Every reply is still structured: the user picks an
   output style, the original text is kept in their own bubble, and each reply is
   editable with its own undo. Nothing leaves the device. */
export default function Clarify() {
  const { notify } = useStore()
  const { user, signIn, startEnrollment } = useAuth()
  const [thread, setThread] = useState<Msg[]>(() => load<Msg[]>(THREAD_KEY, []).map(m => (m.role === 'assistant' && m.status === 'working' ? { ...m, status: 'error' as const, error: { code: 'interrupted', message: 'This reply was interrupted. Try again.' } } : m)))
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(DRAFT_KEY) ?? '' } catch { return '' } })
  const [mode, setMode] = useState<Mode>('explicit')
  const [opts, setOpts] = useState<SayOpts>({ audience: '', tone: 'neutral', keep: '', avoid: '' })
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { try { localStorage.setItem(THREAD_KEY, JSON.stringify(thread)) } catch { /* ignore */ } }, [thread])
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, draft) } catch { /* ignore */ } }, [draft])
  // Bring the newest prompt to the top so its reply unfolds beneath it.
  useEffect(() => {
    const rows = endRef.current?.parentElement?.querySelectorAll('.chat-row.is-user')
    rows?.[rows.length - 1]?.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' })
  }, [thread.length])

  const settle = (aiId: string, patch: Partial<AiMsg>) =>
    setThread(t => t.map(x => (x.id === aiId && x.role === 'assistant' ? { ...x, ...patch } : x)))

  /** Gemini via Cloud Run, or local rules in demo mode / on request. */
  const run = async (aiId: string, source: string, m: Mode, o: SayOpts, engine: 'ai' | 'rules') => {
    settle(aiId, { status: 'working', error: undefined })
    if (engine === 'rules') {
      await new Promise(r => window.setTimeout(r, 500))
      settle(aiId, { status: 'done', result: analyse(source), engine: 'rules' })
      playAudio('complete')
      return
    }
    try {
      const { result, id: tid } = await apiPost<{ result: Analysis; id?: string }>('/v1/transformations', {
        text: source, mode: m, tone: o.tone, audience: o.audience, keep: o.keep, avoid: o.avoid,
      }, 20000)
      settle(aiId, { status: 'done', result, engine: 'ai', tid })
      playAudio('complete')
      notify(`${modes.find(x => x.id === m)!.title}: reply ready`)
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError('unknown', 'Something went wrong. Try again.')
      settle(aiId, { status: 'error', error: { code: e.code, message: e.message } })
      playAudio('alert')
    }
  }

  const respond = (source: string, m: Mode, userText: string, followUpOf?: string) => {
    const aiId = uid()
    playAudio('beep')
    setThread(t => [
      ...t,
      { id: uid(), role: 'user', text: userText, mode: m, followUpOf },
      { id: aiId, role: 'assistant', source, mode: m, opts, status: 'working', history: [] },
    ])
    void run(aiId, source, m, opts, DEMO ? 'rules' : 'ai')
  }

  const send = () => {
    const text = draft.trim()
    if (!text) return
    respond(text, mode, text)
    setDraft('')
    inputRef.current?.focus()
  }

  const restyle = (msg: AiMsg, m: Mode) => respond(msg.source, m, modes.find(x => x.id === m)!.title, msg.id)

  // Edits are saved to the account as new versions, debounced per reply.
  const saveTimers = useRef(new Map<string, number>())
  const persist = (msg: AiMsg | undefined, next: Analysis) => {
    if (!msg?.tid) return
    window.clearTimeout(saveTimers.current.get(msg.id))
    saveTimers.current.set(msg.id, window.setTimeout(() => {
      void api('PATCH', `/v1/transformations/${msg.tid}`, { result: next }).catch(() => notify('Could not save that edit to your account. It is kept here.'))
    }, 1200))
  }
  const report = (msg: AiMsg) => {
    if (msg.tid) void api('POST', `/v1/transformations/${msg.tid}/report`, { reason: 'unhelpful' }).catch(() => undefined)
    notify('Thanks. Your report has been noted.')
  }

  const update = (id: string, next: Analysis, structural: boolean) => {
    persist(thread.find((m): m is AiMsg => m.id === id && m.role === 'assistant'), next)
    applyUpdate(id, next, structural)
  }
  const applyUpdate = (id: string, next: Analysis, structural: boolean) => setThread(t => t.map(x => {
    if (x.id !== id || x.role !== 'assistant' || !x.result) return x
    return { ...x, result: next, history: structural ? [...x.history.slice(-19), x.result] : x.history }
  }))
  const undo = (id: string) => {
    const msg = thread.find((m): m is AiMsg => m.id === id && m.role === 'assistant')
    const prev = msg?.history[msg.history.length - 1]
    if (prev) persist(msg, prev)
    playAudio('boop')
    setThread(t => t.map(x => (x.id === id && x.role === 'assistant' && x.history.length
      ? { ...x, result: x.history[x.history.length - 1], history: x.history.slice(0, -1) } : x)))
    notify('Restored the previous version')
  }

  const clear = () => { setThread([]); notify('Started a new conversation') }

  // Highlight unclear sentences in a user's original once its reply is in.
  const marksFor = (idx: number) => {
    const next = thread[idx + 1]
    return next?.role === 'assistant' && next.result ? next.result.unclear.map(u => u.source).filter(Boolean) as string[] : []
  }

  return (
    <div className="page chat-page">
      <div className="page-head">
        <div className="row" style={{ gap: 'var(--s3)' }}>
          <h1>Clarify</h1>
          <PrivateChip text="Private" />
        </div>
        {thread.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={clear}><Icon name="plus" size={16} />New conversation</button>
        )}
      </div>

      <div className="chat-thread" role="log" aria-label="Clarify conversation" aria-live="polite">
        {thread.length === 0 && (
          <div className="chat-empty rise">
            <span className="chat-avatar is-lg" aria-hidden><Icon name="sparkle" size={26} /></span>
            <h2>What would you like to make clearer?</h2>
            <p className="muted">Paste a message or type a thought, pick a style, and send.</p>
            <div className="chat-suggest">
              {(['explicit', 'breakdown', 'mindmap'] as Mode[]).map((m, i) => (
                <button key={m} type="button" className="chat-suggestion glass rise" style={{ '--i': i + 1 } as CSSProperties}
                  onClick={() => { setMode(m); respond(example, m, example) }}>
                  <Icon name={modeIcon[m]} size={18} />
                  <span><strong>{modes.find(x => x.id === m)!.title}</strong><span className="faint">the example message</span></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.map((msg, idx) => msg.role === 'user' ? (
          <div key={msg.id} className="chat-row is-user rise">
            <div className={`chat-bubble${msg.followUpOf ? ' is-followup' : ''}`}>
              {msg.followUpOf
                ? <span className="row" style={{ gap: 6 }}><Icon name={modeIcon[msg.mode]} size={15} />Show this as: {msg.text}</span>
                : <span className="chat-original"><Highlighted text={msg.text} marks={marksFor(idx)} /></span>}
              {!msg.followUpOf && (
                <span className="chat-chip"><Icon name={modeIcon[msg.mode]} size={13} />{modes.find(x => x.id === msg.mode)!.title}</span>
              )}
            </div>
          </div>
        ) : (
          <div key={msg.id} className="chat-row is-ai rise">
            <span className="chat-avatar" aria-hidden><Icon name="sparkle" size={16} /></span>
            <div className="chat-reply">
              {msg.status === 'working' ? (
                <div className="chat-typing glass" aria-label="Working"><span /><span /><span /></div>
              ) : msg.status === 'error' ? (
                <div className="chat-error glass" role="alert">
                  <Icon name="flag" size={18} />
                  <div className="stack-sm">
                    <p>{msg.error?.message}</p>
                    <div className="row" style={{ gap: 'var(--s2)' }}>
                      {(msg.error?.code === 'unauthenticated' || msg.error?.code === 'invalid_token') && !user && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void signIn()}><Icon name="user" size={16} />Sign in</button>
                      )}
                      {msg.error?.code === 'mfa_required' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void startEnrollment()}><Icon name="lock" size={16} />Set up two-step sign-in</button>
                      )}
                      <button type="button" className="btn btn-sm" onClick={() => void run(msg.id, msg.source, msg.mode, msg.opts, 'ai')}><Icon name="undo" size={16} />Try again</button>
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => void run(msg.id, msg.source, msg.mode, msg.opts, 'rules')}>Use offline rules</button>
                    </div>
                  </div>
                </div>
              ) : msg.result && (
                <>
                  <div className="row-between">
                    <span className="badge badge-ai"><Icon name={modeIcon[msg.mode]} size={13} />{modes.find(x => x.id === msg.mode)!.title} · {msg.engine === 'ai' ? 'Gemini' : 'offline rules'} · editable</span>
                    <div className="row" style={{ gap: 2 }}>
                      <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label="Undo" data-tip="Undo" onClick={() => undo(msg.id)} disabled={!msg.history.length}><Icon name="undo" size={16} /></button>
                      <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label="Report this reply" data-tip="Report" onClick={() => report(msg)}><Icon name="flag" size={16} /></button>
                    </div>
                  </div>
                  {!!msg.result.assumptions?.length && (
                    <p className="chat-assume faint"><Icon name="question" size={14} />Assumed: {msg.result.assumptions.join(' · ')}</p>
                  )}
                  <div className="stack">
                    {(msg.mode === 'explicit' || msg.mode === 'cards') && <StandardResult result={msg.result} edit={a => update(msg.id, a, false)} commit={a => update(msg.id, a, true)} />}
                    {msg.mode === 'breakdown' && <Breakdown result={msg.result} edit={a => update(msg.id, a, false)} commit={a => update(msg.id, a, true)} />}
                    {msg.mode === 'mindmap' && <MindMap result={msg.result} edit={a => update(msg.id, a, false)} />}
                    {msg.mode === 'say' && <SayThis source={msg.source} opts={msg.opts} aiDraft={msg.result.draft} />}
                    {msg.mode === 'conversation' && <Conversation result={msg.result} edit={a => update(msg.id, a, false)} />}
                  </div>
                  <div className="chat-restyle" role="group" aria-label="Show the same text in another style">
                    <span className="faint">Try as</span>
                    {modes.filter(m => m.id !== msg.mode).map(m => (
                      <button key={m.id} type="button" className="chip" onClick={() => restyle(msg, m.id)}>
                        <Icon name={modeIcon[m.id]} size={13} />{m.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="chat-composer glass glass-strong" onSubmit={e => { e.preventDefault(); send() }}>
        <div className="chat-styles" role="radiogroup" aria-label="Output style">
          {modes.map(m => (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`chat-style${mode === m.id ? ' is-on' : ''}`} onClick={() => setMode(m.id)} data-tip={m.blurb}>
              <Icon name={modeIcon[m.id]} size={15} />{m.title}
            </button>
          ))}
        </div>
        {mode === 'say' && (
          <div className="chat-say fade">
            <input type="text" aria-label="Who is it for?" placeholder="To (e.g. Maya)" value={opts.audience} onChange={e => setOpts(o => ({ ...o, audience: e.target.value }))} />
            <Segmented label="Tone" value={opts.tone} onChange={v => setOpts(o => ({ ...o, tone: v }))} options={[{ value: 'warm', label: 'Warm' }, { value: 'neutral', label: 'Neutral' }, { value: 'direct', label: 'Direct' }]} />
            <input type="text" aria-label="Phrases to avoid, comma separated" placeholder="Avoid (e.g. just, sorry)" value={opts.avoid} onChange={e => setOpts(o => ({ ...o, avoid: e.target.value }))} />
          </div>
        )}
        <div className="chat-input">
          <label htmlFor="chat-text" className="visually-hidden">Message</label>
          <textarea
            id="chat-text" ref={inputRef} rows={1} className="autogrow"
            placeholder="Paste a message or type a thought…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          />
          <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label={`Send: ${modes.find(m => m.id === mode)!.action}`}>
            <Icon name="send" size={20} />
          </button>
        </div>
      </form>
    </div>
  )
}

const cardIcon: Record<string, IconName> = { original: 'inbox', interp: 'sparkle', required: 'check', unclear: 'flag', ask: 'question', next: 'list' }

function Card({ kind, title, badge, children, i = 0, action }: { kind: string; title: string; badge?: ReactNode; children: ReactNode; i?: number; action?: ReactNode }) {
  return (
    <section className={`glass result-card is-${kind} rise`} style={{ '--i': i } as CSSProperties}>
      <div className="row-between">
        <div className="row"><h3 className="h-sm"><span className="kind-icon" style={{ '--kind': `var(--card-${kind}, var(--accent))` } as CSSProperties} aria-hidden><Icon name={cardIcon[kind] ?? 'list'} size={16} /></span>{title}</h3>{badge}</div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Highlighted({ text, marks }: { text: string; marks: string[] }) {
  if (!marks.length) return <>{text}</>
  const parts: ReactNode[] = []
  let rest = text
  let k = 0
  for (const m of [...new Set(marks)]) {
    const idx = rest.indexOf(m)
    if (idx < 0) continue
    parts.push(rest.slice(0, idx), <mark key={k++}>{m}</mark>)
    rest = rest.slice(idx + m.length)
  }
  parts.push(rest)
  return <>{parts}</>
}

function EditableList({ items, onChange, label, sourceLabel = true, copy }: { items: Sourced[]; onChange: (items: Sourced[]) => void; label: string; sourceLabel?: boolean; copy?: boolean }) {
  const { notify } = useStore()
  if (!items.length) return <p className="muted small">Nothing found.</p>
  return (
    <ul className="result-list">
      {items.map((it, idx) => (
        <li key={it.id} className="glass-inset">
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <textarea
              className="input-inline autogrow"
              rows={Math.max(1, Math.ceil(it.text.length / 42))}
              aria-label={`${label} ${idx + 1}`}
              value={it.text}
              onChange={e => onChange(items.map(x => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
            />
            {copy && (
              <button
                type="button"
                className="btn btn-quiet icon-btn btn-sm"
                aria-label={`Copy question ${idx + 1}`}
                onClick={() => { navigator.clipboard?.writeText(it.text).then(() => notify('Copied. Paste it wherever you want to ask.'), () => notify('Copy was blocked by the browser')) }}
              >
                <Icon name="copy" size={16} />
              </button>
            )}
          </div>
          {sourceLabel && it.source && <span className="source-quote">Source: “{it.source}”</span>}
        </li>
      ))}
    </ul>
  )
}

/* Replies open as a row of aspect chips. Nothing is shown until the person asks
   for it, so one reply never floods the screen. */
type Aspect = { key: string; label: string; icon: IconName; count?: number; tone: string; node: ReactNode }

function Aspects({ items, label }: { items: Aspect[]; label: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (k: string) => {
    playAudio('tack')
    setOpen(o => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  const all = open.size === items.length
  const uidRef = useRef(uid())
  return (
    <div className="aspects">
      <div className="aspect-bar" role="group" aria-label={label}>
        {items.map((a, i) => (
          <button
            key={a.key} type="button"
            className={`aspect-chip rise${open.has(a.key) ? ' is-open' : ''}`}
            style={{ '--i': i, '--tone': `var(--card-${a.tone})` } as CSSProperties}
            aria-expanded={open.has(a.key)} aria-controls={`${uidRef.current}-${a.key}`}
            onClick={() => toggle(a.key)}
          >
            <span className="aspect-icon" aria-hidden><Icon name={a.icon} size={15} /></span>
            {a.label}
            {a.count !== undefined && <span className="aspect-count">{a.count}</span>}
          </button>
        ))}
        <button type="button" className="aspect-all" onClick={() => setOpen(all ? new Set() : new Set(items.map(a => a.key)))}>
          {all ? 'Hide all' : 'Show all'}
        </button>
      </div>
      {items.map(a => (
        <Disclose key={a.key} open={open.has(a.key)} id={`${uidRef.current}-${a.key}`}>
          <div className="aspect-body">{a.node}</div>
        </Disclose>
      ))}
    </div>
  )
}

function StandardResult({ result, edit, commit }: { result: Analysis; edit: (a: Analysis) => void; commit: (a: Analysis) => void }) {
  const { addTask, notify } = useStore()
  const addNext = () => {
    result.next.forEach(s => addTask({ title: s.text, minutes: s.minutes, doneWhen: s.doneWhen, source: 'Clarify' }))
    playAudio('boop')
    notify(`Added ${result.next.length} steps to your unscheduled tray`)
  }
  const copyAll = () => {
    playAudio('tack')
    navigator.clipboard?.writeText(result.questions.map(q => `• ${q.text}`).join('\n')).then(() => notify('Questions copied'), () => notify('Copy was blocked by the browser'))
  }
  return (
    <Aspects label="Parts of this reply" items={[
      { key: 'meaning', label: 'Meaning', icon: 'sparkle', tone: 'interp', count: result.interpretation.length, node: (
        <Card kind="interp" title="What it appears to mean" badge={<span className="badge badge-ai">Interpretation</span>}>
          <p className="faint">One possible reading. The sender may have meant something else.</p>
          <EditableList label="Interpretation" items={result.interpretation} onChange={v => edit({ ...result, interpretation: v })} />
        </Card>
      ) },
      { key: 'required', label: 'Required', icon: 'check', tone: 'required', count: result.required.length, node: (
        <Card kind="required" title="What is required" badge={<span className="badge badge-ok">From the text</span>}>
          <EditableList label="Requirement" items={result.required} onChange={v => edit({ ...result, required: v })} />
        </Card>
      ) },
      { key: 'unclear', label: 'Unclear', icon: 'flag', tone: 'unclear', count: result.unclear.length, node: (
        <Card kind="unclear" title="What is unclear" badge={<span className="badge badge-warn">{result.unclear.length} open</span>}>
          <EditableList label="Unclear point" items={result.unclear} onChange={v => edit({ ...result, unclear: v })} />
        </Card>
      ) },
      { key: 'ask', label: 'Ask', icon: 'question', tone: 'ask', count: result.questions.length, node: (
        <Card kind="ask" title="What I can ask" badge={<span className="badge badge-info">Not sent</span>}
          action={<button type="button" className="btn btn-sm" onClick={copyAll}><Icon name="copy" size={16} />Copy all</button>}>
          <EditableList label="Question" items={result.questions} sourceLabel={false} copy onChange={v => edit({ ...result, questions: v })} />
        </Card>
      ) },
      { key: 'next', label: 'Next', icon: 'list', tone: 'next', count: result.next.length, node: (
        <Card kind="next" title="What happens next"
          action={<button type="button" className="btn btn-primary btn-sm" onClick={addNext} disabled={!result.next.length}><Icon name="inbox" size={16} />Add to tray</button>}>
          <EditableList label="Next step" items={result.next} sourceLabel={false} onChange={v => commit({ ...result, next: v as Step[] })} />
        </Card>
      ) },
    ]} />
  )
}

function Breakdown({ result, edit, commit }: { result: Analysis; edit: (a: Analysis) => void; commit: (a: Analysis) => void }) {
  const { tasks, blocks, prefs, addTask, notify } = useStore()
  const steps = result.next
  const setSteps = (next: Step[], structural = false) => (structural ? commit : edit)({ ...result, next: next })
  const patch = (id: string, p: Partial<Step>) => setSteps(steps.map(s => (s.id === id ? { ...s, ...p } : s)))
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir
    if (j < 0 || j >= steps.length) return
    const copy = [...steps]
    ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
    setSteps(copy, true)
  }

  const [chosen, setChosen] = useState<Strategy | null>(null)
  const busy = useMemo(() => busyFrom(tasks, blocks), [tasks, blocks])
  const options = strategies.map(s => ({ ...s, starts: propose(busy, steps, s.id, prefs.bufferMinutes) }))
  const viable = options.filter(o => o.starts)

  const approve = (id: Strategy) => {
    const opt = options.find(o => o.id === id)
    if (!opt?.starts) return
    steps.forEach((s, i) => addTask({ title: s.text, minutes: s.minutes, doneWhen: s.doneWhen, start: fromMinutes(opt.starts![i]), source: `Clarify · ${opt.title}` }))
    setChosen(id)
    playAudio('complete')
    notify(`Added ${steps.length} steps to Today. Nothing was written to your external calendar.`)
  }
  const toTray = () => {
    steps.forEach(s => addTask({ title: s.text, minutes: s.minutes, doneWhen: s.doneWhen, source: 'Clarify' }))
    playAudio('boop')
    notify(`Added ${steps.length} steps to your unscheduled tray`)
  }

  const total = steps.reduce((n, s) => n + s.minutes, 0)

  return (
    <Aspects label="Parts of this plan" items={[
      { key: 'steps', label: 'Steps', icon: 'list', tone: 'next', count: steps.length, node: (
      <Card kind="next" title="Steps" i={1} badge={<span className="badge">{steps.length} steps · {formatDuration(total)}</span>}
        action={<button type="button" className="btn btn-sm" onClick={() => setSteps([...steps, { id: uid(), text: 'New step', minutes: 15, doneWhen: '' }], true)}><Icon name="plus" size={16} />Add step</button>}
      >
        <ol className="stack-sm" style={{ listStyle: 'none', padding: 0 }}>
          {steps.map((s, idx) => (
            <li key={s.id} className="glass-inset step-card">
              <span className="step-num" aria-hidden>{idx + 1}</span>
              <div className="stack-sm" style={{ gap: 'var(--s1)' }}>
                <input type="text" className="input-inline" style={{ fontWeight: 600 }} aria-label={`Step ${idx + 1} action`} value={s.text} onChange={e => patch(s.id, { text: e.target.value })} />
                <div className="row" style={{ gap: 'var(--s2)' }}>
                  <label className="faint" htmlFor={`min-${s.id}`}>Minutes</label>
                  <input id={`min-${s.id}`} type="number" min={5} step={5} value={s.minutes} onChange={e => patch(s.id, { minutes: Math.max(5, Number(e.target.value) || 5) })} style={{ width: 90, padding: '4px 10px' }} />
                </div>
                <input type="text" className="input-inline small muted" aria-label={`Step ${idx + 1} done when`} placeholder="Done when…" value={s.doneWhen} onChange={e => patch(s.id, { doneWhen: e.target.value })} />
              </div>
              <div className="stack-sm" style={{ gap: 2 }}>
                <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Move step ${idx + 1} earlier`} disabled={idx === 0} onClick={() => move(idx, -1)}><Icon name="arrowUp" size={16} /></button>
                <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Move step ${idx + 1} later`} disabled={idx === steps.length - 1} onClick={() => move(idx, 1)}><Icon name="arrowDown" size={16} /></button>
                <button type="button" className="btn btn-quiet icon-btn btn-sm" aria-label={`Remove step ${idx + 1}`} onClick={() => setSteps(steps.filter(x => x.id !== s.id), true)}><Icon name="trash" size={16} /></button>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      ) },
      { key: 'schedule', label: 'Schedule', icon: 'calendar', tone: 'ask', count: viable.length, node: (
      <Card kind="ask" title="Schedule options" i={2} badge={<span className="badge badge-info">Nothing is booked until you approve</span>}>
        {viable.length === 0 ? (
          <div className="stack-sm">
            <p className="muted">There isn’t enough free time left today for these steps. You can keep them in your tray and place them later.</p>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={toTray}><Icon name="inbox" size={16} />Add steps to tray</button>
          </div>
        ) : (
          <div className="grid grid-3" style={{ gap: 'var(--s3)' }}>
            {options.map(o => (
              <div key={o.id} className="glass-inset stack-sm" style={{ padding: 'var(--s4)', borderColor: chosen === o.id ? 'var(--accent)' : undefined }}>
                <strong>{o.title}</strong>
                <p className="faint">{o.why}</p>
                {o.starts ? (
                  <ul className="small" style={{ paddingLeft: '1.1em' }}>
                    {steps.map((s, i) => <li key={s.id}><span className="time">{fromMinutes(o.starts![i])}</span> {s.text}</li>)}
                  </ul>
                ) : <p className="small muted">Doesn’t fit in today’s remaining time.</p>}
                <button type="button" className={`btn btn-sm${chosen === o.id ? '' : ' btn-primary'}`} style={{ marginTop: 'auto' }} disabled={!o.starts || !!chosen} onClick={() => approve(o.id)}>
                  {chosen === o.id ? <><Icon name="check" size={16} />Added to Today</> : 'Add this plan to Today'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      ) },
    ]} />
  )
}

function MindMap({ result, edit }: { result: Analysis; edit: (a: Analysis) => void }) {
  const [view, setView] = useState<'map' | 'outline'>('map')
  const branches: { key: 'required' | 'unclear' | 'next'; label: string; items: Sourced[] }[] = [
    { key: 'required', label: 'Required', items: result.required },
    { key: 'unclear', label: 'Unclear', items: result.unclear },
    { key: 'next', label: 'Next steps', items: result.next },
  ]
  const leafH = 40
  const leaves = branches.flatMap(b => b.items.length ? b.items : [{ id: `${b.key}-empty`, text: '(nothing yet)' }])
  const height = Math.max(200, leaves.length * leafH + 40)
  let cursor = 20
  const layout = branches.map(b => {
    const n = Math.max(1, b.items.length)
    const top = cursor
    cursor += n * leafH
    return { ...b, y: top + (n * leafH) / 2, leaves: (b.items.length ? b.items : [{ id: `${b.key}-empty`, text: '(nothing yet)' }]).map((it, i) => ({ ...it, y: top + i * leafH + leafH / 2 })) }
  })
  const rootY = height / 2
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

  return (
    <Card kind="interp" title="Mind map" i={1} action={<Segmented label="Mind map view" value={view} onChange={setView} options={[{ value: 'map', label: 'Map' }, { value: 'outline', label: 'Outline' }]} />}>
      <p className="faint">The map and outline show the same content. Edit in the outline; the map updates.</p>
      {view === 'map' ? (
        <div className="fade glass-inset" style={{ padding: 'var(--s2)', overflowX: 'auto' }}>
          <svg className="mindmap" viewBox={`0 0 820 ${height}`} role="img" aria-label="Mind map. Switch to Outline for the same content as a list.">
            {layout.map(b => (
              <g key={b.key}>
                <path className="mm-link" d={`M150 ${rootY} C 190 ${rootY}, 190 ${b.y}, 230 ${b.y}`} />
                {b.leaves.map(l => <path key={l.id} className="mm-link" d={`M370 ${b.y} C 400 ${b.y}, 400 ${l.y}, 430 ${l.y}`} />)}
              </g>
            ))}
            <g className="mm-node is-root"><rect x={10} y={rootY - 20} width={140} height={40} rx={12} /><text x={80} y={rootY + 5} textAnchor="middle">The request</text></g>
            {layout.map(b => (
              <g key={b.key}>
                <g className="mm-node"><rect x={230} y={b.y - 18} width={140} height={36} rx={10} /><text x={300} y={b.y + 5} textAnchor="middle" style={{ fontWeight: 700 }}>{b.label}</text></g>
                {b.leaves.map(l => (
                  <g key={l.id} className="mm-node"><rect x={430} y={l.y - 15} width={380} height={30} rx={8} /><text x={444} y={l.y + 5}>{clip(l.text, 52)}</text></g>
                ))}
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <ul className="outline-tree fade">
          <li>
            <strong>The request</strong>
            <ul>
              {branches.map(b => (
                <li key={b.key}>
                  <strong>{b.label}</strong>
                  <ul>
                    {b.items.length === 0 && <li className="muted">(nothing yet)</li>}
                    {b.items.map((it, idx) => (
                      <li key={it.id}>
                        <input
                          type="text" className="input-inline" aria-label={`${b.label} ${idx + 1}`} value={it.text}
                          onChange={e => edit({ ...result, [b.key]: b.items.map(x => (x.id === it.id ? { ...x, text: e.target.value } : x)) })}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      )}
    </Card>
  )
}

function SayThis({ source, opts, aiDraft }: { source: string; opts: Parameters<typeof draftMessage>[1]; aiDraft?: string }) {
  const { notify } = useStore()
  const initial = useMemo(() => (aiDraft ? { draft: aiDraft, removed: [] as string[] } : draftMessage(source, opts)), [source, aiDraft]) // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState(initial.draft)
  return (
    <Card kind="next" title="Draft message" i={1} badge={<span className="badge badge-ai">Suggestion</span>}
      action={<button type="button" className="btn btn-primary btn-sm" onClick={() => navigator.clipboard?.writeText(draft).then(() => notify('Draft copied. It has not been sent.'), () => notify('Copy was blocked by the browser'))}><Icon name="copy" size={16} />Copy draft</button>}
    >
      <label htmlFor="draft" className="visually-hidden">Draft message</label>
      <textarea id="draft" rows={9} value={draft} onChange={e => setDraft(e.target.value)} />
      <p className="faint">
        Tone: {opts.tone}. {initial.removed.length ? `Removed: ${initial.removed.join(', ')}. ` : ''}This app never sends messages for you.
      </p>
    </Card>
  )
}

function Conversation({ result, edit }: { result: Analysis; edit: (a: Analysis) => void }) {
  const [boundaries, setBoundaries] = useState('')
  const [outcomes, setOutcomes] = useState('')
  return (
    <Aspects label="Parts of this conversation plan" items={[
      { key: 'goal', label: 'Goal', icon: 'target', tone: 'interp', count: result.interpretation.length, node: (
        <Card kind="interp" title="Goal" badge={<span className="badge badge-ai">Suggested</span>}>
          <EditableList label="Goal" items={result.interpretation} onChange={v => edit({ ...result, interpretation: v })} />
        </Card>
      ) },
      { key: 'points', label: 'Key points', icon: 'check', tone: 'required', count: result.required.length, node: (
        <Card kind="required" title="Key points">
          <EditableList label="Key point" items={result.required} onChange={v => edit({ ...result, required: v })} />
        </Card>
      ) },
      { key: 'ask', label: 'Ask', icon: 'question', tone: 'ask', count: result.questions.length, node: (
        <Card kind="ask" title="Questions to ask">
          <EditableList label="Question" items={result.questions} sourceLabel={false} copy onChange={v => edit({ ...result, questions: v })} />
        </Card>
      ) },
      { key: 'bounds', label: 'Boundaries', icon: 'lock', tone: 'unclear', node: (
        <Card kind="unclear" title="My boundaries" badge={<span className="badge"><Icon name="lock" size={12} />Private</span>}>
          <label htmlFor="bnd" className="visually-hidden">My boundaries</label>
          <textarea id="bnd" value={boundaries} onChange={e => setBoundaries(e.target.value)} placeholder="e.g. I can’t take this on before Thursday without dropping something else." />
        </Card>
      ) },
      { key: 'outcomes', label: 'Outcomes', icon: 'arrowRight', tone: 'next', node: (
        <Card kind="next" title="Possible outcomes">
          <label htmlFor="out" className="visually-hidden">Possible outcomes</label>
          <textarea id="out" value={outcomes} onChange={e => setOutcomes(e.target.value)} placeholder="e.g. We agree a date · We move another task · I ask for help" />
        </Card>
      ) },
    ]} />
  )
}
