import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConversationHistory } from '../components/ConversationHistory'
import type { ConversationSummary } from '../components/ConversationHistory'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { Modal } from '../components/ui'
import { articles } from '../lib/data'
import { isVisibleInPreview } from '../lib/guide'
import type { PreviewRole } from '../lib/guide'
import { ApiError, api, apiPost } from '../lib/api'
import { useAuth } from '../lib/auth'
import { guideBody } from '../lib/sync'
import { useStore } from '../lib/store'
import { useLocalState } from '../lib/local-state'
import { uid } from '../lib/time'
import type { Article, Audience, GuideField } from '../lib/types'

type GuideView = 'chat' | 'profile' | 'sources'

interface ChatCitation {
  title: string
  owner: string
  version: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: ChatCitation[]
  isError?: boolean
}

const starterMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi — I’m your workplace guide. I can help you turn preferences into clear language, prepare for conversations, and find answers in your organization’s guidance. What would be useful right now?',
}

const quickPrompts = [
  'Turn my communication style into a short team introduction',
  'Help me ask for a specific deadline without sounding abrupt',
  'What does our guidance say about giving useful feedback?',
]

const demoMode = import.meta.env.VITE_GUIDE_CHAT_DEMO_MODE !== 'false'

function articleCitation(article: Article): ChatCitation {
  return { title: article.title, owner: article.owner, version: article.version }
}

function buildPreviewResponse(prompt: string, guide: GuideField[], includeGuide: boolean, includeKnowledge: boolean) {
  const normalized = prompt.toLowerCase()
  const selectedArticle = normalized.includes('feedback')
    ? articles[2]
    : normalized.includes('meeting')
      ? articles[1]
      : articles[0]

  if (normalized.includes('communication style') || normalized.includes('working guide') || normalized.includes('team introduction')) {
    const preferences = guide.filter(field => field.value && field.audience !== 'private').slice(0, 3)
    const summary = includeGuide && preferences.length > 0
      ? preferences.map(field => `${field.label.toLowerCase()}: ${field.value}`).join('\n')
      : 'Enable communication style context so I can tailor this draft to your saved preferences.'
    return {
      content: `Here is a concise version you can adapt:\n\n“Here are a few things that help me do my best work:\n${summary}\n\nPlease ask if you want to check what works for a particular situation.”`,
      citations: [] as ChatCitation[],
    }
  }

  return {
    content: `Start with the outcome, name the specific action, and give a concrete time. For example:\n\n“Could you send the reviewed outline by 3 pm Thursday? Please add comments beside anything that needs a decision. If that timing does not work, let me know what is realistic.”\n\nThat makes the request easier to act on while leaving room for the other person to respond.`,
    citations: includeKnowledge ? [articleCitation(selectedArticle)] : [],
  }
}

export default function Guide() {
  const [view, setView] = useLocalState<GuideView>('clarity.guide.view', 'chat')
  const location = useLocation()
  useEffect(() => { if (location.state?.taskId) setView('chat') }, [location.state, setView])

  return (
    <div className="page guide-ai-page">
      <div className="page-head">
        <h1 className="row" style={{ gap: 'var(--s3)' }}><Icon name="guide" size={28} />Communication style</h1>
        <div className="row" role="group" aria-label="Communication style view">
          {(['chat', 'profile', 'sources'] as const).map(value => <button type="button" key={value} className={`btn btn-sm ${view === value ? '' : 'btn-quiet'}`} aria-pressed={view === value} onClick={() => setView(value)}>{value === 'chat' ? 'Ask' : value === 'profile' ? 'My preferences' : 'Sources'}</button>)}
        </div>
      </div>

      <div hidden={view !== 'chat'}><GuideChat /></div>
      {view === 'profile' ? <WorkingGuide /> : view === 'sources' ? <KnowledgeSources /> : null}
    </div>
  )
}

function GuideChat() {
  const { guide, tasks } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const contextTask = tasks.find(task => task.id === location.state?.taskId)
  const [messages, setMessages] = useLocalState<ChatMessage[]>('clarity.guide.messages', [starterMessage])
  const [draft, setDraft] = useLocalState('clarity.guide.draft', '')
  const [history, setHistory] = useLocalState<(ConversationSummary & { messages: ChatMessage[]; draft: string })[]>('clarity.guide.history', [])
  const [sending, setSending] = useLocalState('clarity.guide.sending', false, false)
  const [includeGuide] = useLocalState('clarity.guide.include-preferences', true)
  const [includeKnowledge] = useLocalState('clarity.guide.include-sources', true)
  const archive = () => ({ id: uid(), title: (messages.find(m => m.role === 'user')?.content || draft || 'Conversation').slice(0, 90), savedAt: new Date().toISOString(), messages, draft })
  const newConversation = () => {
    if (messages.length > 1 || draft.trim()) setHistory(items => [archive(), ...items])
    setMessages([starterMessage]); setDraft('')
  }
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (endRef.current?.getClientRects().length) endRef.current.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'nearest' })
  }, [messages, sending])

  const sendMessage = async (value: string, retry = false) => {
    const prompt = value.trim()
    if (!prompt || sending) return

    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: prompt }
    const requestHistory = retry ? messages.filter(message => !message.isError) : [...messages, userMessage]
    setMessages(requestHistory)
    if (!retry) setDraft('')
    setSending(true)

    try {
      let reply: { content: string; citations?: ChatCitation[] }

      if (demoMode) {
        await new Promise(resolve => window.setTimeout(resolve, 450))
        reply = buildPreviewResponse(prompt, guide, includeGuide, includeKnowledge)
      } else {
        const path = import.meta.env.VITE_GUIDE_CHAT_PATH || '/v1/guide/chat'
        const timeout = Number(import.meta.env.VITE_GUIDE_CHAT_TIMEOUT_MS) || 20000
        const data = await apiPost<{ answer: string; citations?: ChatCitation[] }>(path, {
          message: prompt,
          history: requestHistory.slice(0, -1).filter(m => m.id !== 'welcome' && !m.isError).slice(-12).map(({ role, content }) => ({ role, content })),
          context: { workingGuide: includeGuide, publishedKnowledge: includeKnowledge },
          // Cloud Run fetches the caller's Working Guide itself; nothing is sent from here.
        }, timeout)
        reply = { content: data.answer, citations: data.citations }
      }

      setMessages(current => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.content,
        citations: reply.citations,
      }])
    } catch (err) {
      setMessages(current => [...current, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: err instanceof ApiError ? err.message : 'I couldn’t reach the communication style service. Try again.',
        isError: true,
      }])
    } finally {
      setSending(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void sendMessage(draft)
  }

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage(draft)
    }
  }

  return (
    <div className="guide-chat-layout">
      <section className="guide-chat glass glass-strong" aria-label="Communication style conversation">
        <header className="guide-chat-header">
          <div className="ai-avatar"><Icon name="sparkle" size={20} /></div>
          <div>
            <strong>Communication coach</strong>
          </div>
          {demoMode ? <div className="preview-badge" style={{ padding: '0 var(--s2)', margin: 0 }}><span /> Local preview mode</div> : null}
          <ConversationHistory items={history} disabled={sending} onSelect={id => {
            const selected = history.find(item => item.id === id)
            if (!selected) return
            setHistory(items => [...(messages.length > 1 || draft.trim() ? [archive()] : []), ...items.filter(item => item.id !== id)])
            setMessages(selected.messages); setDraft(selected.draft)
          }} />
          <button
            type="button"
            className="btn btn-quiet btn-sm chat-clear"
            onClick={newConversation}
            disabled={sending || (messages.length === 1 && !draft.trim())}
          >
            <Icon name="plus" size={15} /> New conversation
          </button>
        </header>

        <div className="guide-chat-messages" role="log" aria-live="polite" aria-label="Conversation messages">
          {messages.map(message => (
            <div key={message.id} className={`chat-row is-${message.role}`}>
              {message.role === 'assistant' ? <span className="chat-avatar"><Icon name="sparkle" size={15} /></span> : null}
              <div className={`chat-bubble${message.isError ? ' is-error' : ''}`}>
                <p>{message.content}</p>
                {message.citations && message.citations.length > 0 ? (
                  <div className="chat-citations" aria-label="Sources">
                    {message.citations.map(citation => (
                      <span key={`${citation.title}-${citation.version}`}>
                        <Icon name="knowledge" size={13} /> {citation.title} · {citation.owner} · {citation.version}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {messages.length === 1 ? (
            <div className="quick-prompts" aria-label="Suggested questions">
              {quickPrompts.map(prompt => (
                <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>{prompt}</button>
              ))}
            </div>
          ) : null}
          {sending ? (
            <div className="chat-row is-assistant" aria-label="Communication style coach is responding">
              <span className="chat-avatar"><Icon name="sparkle" size={15} /></span>
              <div className="chat-bubble chat-typing"><span /><span /><span /></div>
            </div>
          ) : null}
          {!sending && (messages.at(-1)?.role === 'user' || messages.at(-1)?.isError) && <button type="button" className="btn btn-sm" onClick={() => {
            const lastPrompt = [...messages].reverse().find(message => message.role === 'user')
            if (lastPrompt) void sendMessage(lastPrompt.content, true)
          }}>Retry reply</button>}
          <div ref={endRef} />
        </div>

        <form className="guide-composer" onSubmit={submit}>
          {contextTask && <div className="task-context-preview stack-sm">
            <strong>Task context · not sent yet</strong>
            <p>{contextTask.title}{contextTask.why ? ` — ${contextTask.why}` : ''}{contextTask.doneWhen ? ` · Done when: ${contextTask.doneWhen}` : ''}</p>
            <div className="row"><button type="button" className="btn btn-sm" onClick={() => {
              setDraft(current => `${current}${current ? '\n\n' : ''}Help me with this task: ${contextTask.title}${contextTask.why ? `\nContext: ${contextTask.why}` : ''}${contextTask.doneWhen ? `\nDone when: ${contextTask.doneWhen}` : ''}`)
              navigate('/guide', { replace: true, state: null })
            }}>Include in draft</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('/guide', { replace: true, state: null })}>Dismiss</button></div>
          </div>}
          <textarea
            rows={2}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleComposerKey}
            placeholder="Ask about communication, meetings, feedback, or your communication style…"
            aria-label="Message communication style coach"
          />
          <button type="submit" className="composer-send" disabled={!draft.trim() || sending} aria-label="Send message">
            <Icon name="arrowUp" size={19} />
          </button>
          <span className="composer-hint">Enter to send · Shift + Enter for a new line</span>
          <span className="composer-hint">{demoMode ? 'Local preview · example replies, no AI request is sent.' : 'Your message, recent conversation, and enabled context are sent to Gemini through your workspace service.'} Conversation history stays on this device.</span>
        </form>
      </section>

    </div>
  )
}

/* One card per preference, laid out as a horizontal, snap-scrolling deck.
   Quick-pick chips keep answers short; a note is there if chips are not enough. */
const fieldMeta: Record<string, { title: string; icon: IconName; picks: { icon: IconName; text: string }[] }> = {
  g1: { title: 'Format', icon: 'message', picks: [
    { icon: 'message', text: 'Written first' }, { icon: 'users', text: 'Calls are fine' },
    { icon: 'clock', text: 'Send the topic in advance' }, { icon: 'list', text: 'Bullet points' } ] },
  g2: { title: 'Context', icon: 'list', picks: [
    { icon: 'arrowUp', text: 'Summary first' }, { icon: 'knowledge', text: 'Full background' }, { icon: 'target', text: 'Just the action' } ] },
  g3: { title: 'Feedback', icon: 'flag', picks: [
    { icon: 'message', text: 'In writing' }, { icon: 'eye', text: 'Specific examples' },
    { icon: 'clock', text: 'Time to respond' }, { icon: 'lock', text: 'One-to-one, not in groups' } ] },
  g4: { title: 'Meetings', icon: 'users', picks: [
    { icon: 'list', text: 'Agenda beforehand' }, { icon: 'hourglass', text: 'Time to think before answering' },
    { icon: 'eye', text: 'Camera optional' }, { icon: 'message', text: 'Written follow-up' } ] },
  g5: { title: 'Focus', icon: 'target', picks: [
    { icon: 'today', text: 'Mornings' }, { icon: 'clock', text: 'Afternoons' },
    { icon: 'message', text: 'Messages are fine' }, { icon: 'close', text: 'No unplanned calls' } ] },
  g6: { title: 'Urgency', icon: 'clock', picks: [
    { icon: 'clock', text: 'Give a specific time' }, { icon: 'question', text: 'Say why it is urgent' }, { icon: 'users', text: 'Call only if truly urgent' } ] },
  g7: { title: 'Check-ins', icon: 'check', picks: [
    { icon: 'undo', text: 'I summarise back' }, { icon: 'question', text: 'Ask me to repeat' }, { icon: 'message', text: 'Written recap' } ] },
  g8: { title: 'Optional', icon: 'lock', picks: [] },
}

const audiences: { value: Audience; label: string; icon: IconName }[] = [
  { value: 'private', label: 'Only me', icon: 'lock' },
  { value: 'selected', label: 'Selected people', icon: 'user' },
  { value: 'team', label: 'My team', icon: 'users' },
  { value: 'organization', label: 'Organization', icon: 'building' },
]

const previewAs: { value: PreviewRole; label: string; icon: IconName }[] = [
  { value: 'edit', label: 'Edit', icon: 'guide' },
  { value: 'selected', label: 'As selected people', icon: 'user' },
  { value: 'team', label: 'As my team', icon: 'users' },
  { value: 'organization', label: 'As the organization', icon: 'building' },
]

const SEP = ' · '
const parts = (v: string) => v.split(SEP).map(x => x.trim()).filter(Boolean)

function WorkingGuide() {
  const { guide, setGuide, notify } = useStore()
  const [role, setRole] = useState<PreviewRole>('edit')
  const [active, setActive] = useState(0)
  const deck = useRef<HTMLDivElement>(null)

  const update = (id: string, patch: Partial<GuideField>) => setGuide(items => items.map(f => (f.id === id ? { ...f, ...patch } : f)))
  const togglePick = (f: GuideField, text: string) => {
    const cur = parts(f.value)
    const next = cur.includes(text) ? cur.filter(x => x !== text) : [...cur, text]
    update(f.id, { value: next.join(SEP) })
  }

  const goTo = (i: number) => {
    const el = deck.current
    const card = el?.children[Math.max(0, Math.min(guide.length - 1, i))] as HTMLElement | undefined
    if (!el || !card) return
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' })
  }

  // Track which card is centred.
  useEffect(() => {
    const el = deck.current
    if (!el || role !== 'edit') return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const mid = el.scrollLeft + el.clientWidth / 2
        let best = 0, dist = Infinity
        Array.from(el.children).forEach((c, i) => {
          const card = c as HTMLElement
          const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid)
          if (d < dist) { dist = d; best = i }
        })
        setActive(best)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [role])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('textarea, input, select')) return
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1) }
  }

  const filled = guide.filter(f => f.value.trim()).length
  const visible = guide.filter(f => f.value.trim() && isVisibleInPreview(f.audience, role))

  return (
    <div className="wg">
      <div className="wg-bar">
        <span className="wg-count"><Icon name="check" size={15} />{filled}/{guide.length}</span>
        {role !== 'edit' && <ShareControls />}
        <div className="wg-roles" role="radiogroup" aria-label="View">
          {previewAs.map(p => (
            <button key={p.value} type="button" role="radio" aria-checked={role === p.value} aria-label={p.label} data-tip={p.label}
              className={`wg-role${role === p.value ? ' is-on' : ''}`} onClick={() => setRole(p.value)}>
              <Icon name={p.value === 'edit' ? 'guide' : 'eye'} size={15} />
              {p.value !== 'edit' && <Icon name={p.icon} size={15} />}
            </button>
          ))}
        </div>
      </div>

      {role === 'edit' ? (
        <>
          <div
            ref={deck}
            className="wg-deck"
            role="region"
            aria-roledescription="carousel"
            aria-label="Communication preferences"
            tabIndex={0}
            onKeyDown={onKey}
          >
            {guide.map((f, i) => {
              const meta = fieldMeta[f.id] ?? { title: f.label, icon: 'guide' as IconName, picks: [] }
              const chosen = parts(f.value)
              const extra = chosen.filter(c => !meta.picks.some(p => p.text === c)).join(SEP)
              return (
                <section
                  key={f.id}
                  className={`wg-card glass${i === active ? ' is-active' : ''}`}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${guide.length}: ${f.label}`}
                  onFocusCapture={() => i !== active && goTo(i)}
                >
                  <header className="wg-head">
                    <span className="wg-icon" aria-hidden><Icon name={meta.icon} size={26} /></span>
                    <div>
                      <h2 className="wg-title">{meta.title}</h2>
                      <p className="wg-sub">{f.label}</p>
                    </div>
                    <span className="wg-num">{i + 1}</span>
                  </header>

                  {meta.picks.length > 0 && (
                    <div className="wg-picks" role="group" aria-label={`${meta.title} options`}>
                      {meta.picks.map(p => {
                        const on = chosen.includes(p.text)
                        return (
                          <button key={p.text} type="button" aria-pressed={on} className={`wg-pick${on ? ' is-on' : ''}`} onClick={() => togglePick(f, p.text)}>
                            <Icon name={on ? 'check' : p.icon} size={16} />{p.text}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <label className="visually-hidden" htmlFor={`wg-note-${f.id}`}>{meta.title}: own words</label>
                  <textarea
                    id={`wg-note-${f.id}`}
                    className="wg-note"
                    rows={meta.picks.length ? 2 : 5}
                    placeholder={meta.picks.length ? 'Own words (optional)' : 'Optional. Never required.'}
                    value={meta.picks.length ? extra : f.value}
                    onChange={e => {
                      if (!meta.picks.length) { update(f.id, { value: e.target.value }); return }
                      const keepPicks = chosen.filter(c => meta.picks.some(p => p.text === c))
                      update(f.id, { value: [...keepPicks, e.target.value].filter(Boolean).join(SEP) })
                    }}
                  />

                  <div className="wg-aud" role="radiogroup" aria-label={`Who can see ${meta.title}`}>
                    {audiences.map(a => (
                      <button key={a.value} type="button" role="radio" aria-checked={f.audience === a.value} aria-label={a.label} data-tip={a.label}
                        className={`wg-aud-btn${f.audience === a.value ? ' is-on' : ''}`}
                        onClick={() => { update(f.id, { audience: a.value }); notify(`${meta.title}: ${a.label.toLowerCase()}`) }}>
                        <Icon name={a.icon} size={16} />
                      </button>
                    ))}
                    <span className="wg-aud-label">{audiences.find(a => a.value === f.audience)?.label}</span>
                  </div>
                </section>
              )
            })}
          </div>

          <div className="wg-nav">
            <button type="button" className="btn icon-btn" aria-label="Previous" onClick={() => goTo(active - 1)} disabled={active === 0}><Icon name="chevronLeft" size={20} /></button>
            <div className="wg-dots" role="tablist" aria-label="Jump to preference">
              {guide.map((f, i) => {
                const meta = fieldMeta[f.id]
                return (
                  <button key={f.id} type="button" role="tab" aria-selected={i === active} aria-label={meta?.title ?? f.label} data-tip={meta?.title ?? f.label}
                    className={`wg-dot${i === active ? ' is-on' : ''}${f.value.trim() ? ' is-filled' : ''}`} onClick={() => goTo(i)}>
                    <Icon name={meta?.icon ?? 'guide'} size={14} />
                  </button>
                )
              })}
            </div>
            <button type="button" className="btn icon-btn" aria-label="Next" onClick={() => goTo(active + 1)} disabled={active === guide.length - 1}><Icon name="chevronRight" size={20} /></button>
          </div>
        </>
      ) : (
        <div className="wg-preview fade" key={role}>
          {visible.length === 0 ? (
            <div className="empty glass card"><Icon name="lock" size={28} /><p>Nothing shared with this audience.</p></div>
          ) : visible.map((f, i) => {
            const meta = fieldMeta[f.id]
            return (
              <div key={f.id} className="wg-pv glass rise" style={{ '--i': i } as CSSProperties}>
                <span className="wg-icon is-sm" aria-hidden><Icon name={meta?.icon ?? 'guide'} size={18} /></span>
                <div>
                  <strong>{meta?.title ?? f.label}</strong>
                  <div className="wg-pv-tags">{parts(f.value).map(p => <span key={p} className="badge">{p}</span>)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Publish the previewed guide as a shared snapshot, or revoke it. Needs the account. */
function ShareControls() {
  const { guide, notify } = useStore()
  const { user } = useAuth()
  const [status, setStatus] = useState<{ shared: boolean; version: number | null } | null>(null)
  const [confirming, setConfirming] = useState<'share' | 'revoke' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) { setStatus(null); return }
    api<{ shared: boolean; version: number | null }>('GET', '/v1/guide/status').then(setStatus, () => setStatus(null))
  }, [user])

  if (!user) return <span className="faint small"><Icon name="lock" size={14} /> Sign in to share</span>

  const counts = (['selected', 'team', 'organization'] as const).map(a => [a, guide.filter(f => f.value.trim() && f.audience === a).length] as const)

  const run = async () => {
    setBusy(true)
    try {
      if (confirming === 'share') {
        // Make sure the server has the latest answers before the snapshot is taken.
        await Promise.all(guide.map((f, i) => api('PUT', `/v1/guide/fields/${f.id}`, guideBody(f, i))))
        const r = await api<{ version: number }>('POST', '/v1/guide/share', { confirm: true })
        setStatus({ shared: true, version: r.version })
        notify(`Communication style shared (version ${r.version})`)
      } else {
        await api('POST', '/v1/guide/revoke', { confirm: true })
        setStatus({ shared: false, version: null })
        notify('Sharing revoked. Your answers are kept.')
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'That did not work. Try again.')
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <div className="wg-share">
      {status?.shared && <span className="badge badge-ok"><Icon name="users" size={13} />Shared · v{status.version}</span>}
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirming('share')}><Icon name="users" size={16} />{status?.shared ? 'Update share' : 'Share'}</button>
      {status?.shared && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming('revoke')}><Icon name="lock" size={16} />Revoke</button>}
      <Modal open={!!confirming} onClose={() => setConfirming(null)} title={confirming === 'share' ? 'Share your communication style?' : 'Revoke sharing?'}>
        <div className="stack">
          {confirming === 'share' ? (
            <ul className="wg-confirm">
              {counts.map(([a, n]) => (
                <li key={a}><Icon name={a === 'selected' ? 'user' : a === 'team' ? 'users' : 'building'} size={16} />{a === 'selected' ? 'Selected people' : a === 'team' ? 'My team' : 'Organization'}<strong>{n}</strong></li>
              ))}
              <li className="faint"><Icon name="lock" size={16} />Private answers are never shared</li>
            </ul>
          ) : (
            <p className="muted small">People will stop seeing your communication style. Your answers stay here.</p>
          )}
          <div className="modal-foot">
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>
              <Icon name={confirming === 'share' ? 'users' : 'lock'} size={18} />{confirming === 'share' ? 'Share now' : 'Revoke'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function KnowledgeSources() {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const tags = useMemo(() => Array.from(new Set(articles.flatMap(article => article.tags))), [])
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    return articles.filter(article => {
      const matchesTag = !activeTag || article.tags.includes(activeTag)
      const matchesText = !text || [article.title, article.summary, article.body, article.owner].some(value => value.toLowerCase().includes(text))
      return matchesTag && matchesText
    })
  }, [query, activeTag])

  return (
    <div className="stack">
            <div className="card glass-strong stack-sm">
        <div className="field" style={{ margin: 0 }}>
          <input type="search" placeholder="Search guidance, policies, templates…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search sources" />
        </div>
        <div className="row-center" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
          <button type="button" className={`chip ${!activeTag ? 'chip-active' : ''}`} onClick={() => setActiveTag(null)}>All topics</button>
          {tags.map(tag => <button key={tag} type="button" className={`chip ${activeTag === tag ? 'chip-active' : ''}`} onClick={() => setActiveTag(activeTag === tag ? null : tag)}>#{tag}</button>)}
        </div>
      </div>

      {filtered.length === 0 ? <div className="empty glass card"><Icon name="search" size={32} /><p>No sources matching “{query}”</p></div> : filtered.map(article => {
        const expanded = expandedId === article.id
        return (
          <article key={article.id} className="article glass card rise">
            <div className="row-between" style={{ alignItems: 'start' }}>
              <div><h2 style={{ fontSize: 'var(--fs-lg)' }}>{article.title}</h2><p className="muted" style={{ marginTop: 'var(--s1)' }}>{article.summary}</p></div>
              <button type="button" className="btn btn-quiet icon-btn" aria-label={expanded ? 'Collapse' : 'Expand'} aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : article.id)}>
                <Icon name={expanded ? 'arrowUp' : 'arrowDown'} size={18} />
              </button>
            </div>
            <div className={`disclose ${expanded ? 'open' : ''}`}><div><div className="card glass-strong" style={{ padding: 'var(--s4)' }}><p>{article.body}</p></div></div></div>
            <div className="meta-row"><span><Icon name="users" size={14} /> {article.owner}</span><span>• {article.source}</span><span>• {article.version}</span><span>• Reviewed {article.lastReviewed}</span></div>
          </article>
        )
      })}
    </div>
  )
}
