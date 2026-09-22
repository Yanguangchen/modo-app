/* Local stand-in for the AI orchestration service.
   It is deliberately conservative: it only extracts what the text says,
   and turns anything missing into a question rather than a guess (§6.4). */
import { uid } from './time'

export type Mode = 'explicit' | 'breakdown' | 'say' | 'cards' | 'mindmap' | 'conversation'

export const modes: { id: Mode; title: string; blurb: string; action: string }[] = [
  { id: 'explicit', title: 'Make explicit', blurb: 'Reveal requests, dates, owners, gaps', action: 'Make this explicit' },
  { id: 'breakdown', title: 'Break down', blurb: 'Turn it into ordered steps', action: 'Break into steps' },
  { id: 'say', title: 'Help me say this', blurb: 'Draft a clear, respectful message', action: 'Draft my message' },
  { id: 'cards', title: 'Show as cards', blurb: 'Split into editable units', action: 'Show as cards' },
  { id: 'mindmap', title: 'Show as a mind map', blurb: 'See how the parts relate', action: 'Show as a mind map' },
  { id: 'conversation', title: 'Prepare a conversation', blurb: 'Goal, points, questions, boundaries', action: 'Prepare my conversation' },
]

export interface Sourced { id: string; text: string; source?: string }
export interface Step extends Sourced { minutes: number; doneWhen: string }

export interface Analysis {
  interpretation: Sourced[]
  required: Sourced[]
  unclear: Sourced[]
  questions: Sourced[]
  next: Step[]
  sentences: string[]
  /** Set by the AI for "Help me say this". */
  draft?: string
  /** Anything the AI had to assume, shown to the user. */
  assumptions?: string[]
}

const requestRe = /\b(can you|could you|would you|please|need(?:s)? (?:to|you)|should|must|make sure|let'?s|send|review|prepare|update|draft|finish|share|check|write|book|set up|pull together|put together|get|look (?:at|into)|sort out|follow up)\b/i
const dateRe = /\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|end of (?:the )?(?:day|week|month)|eod|eow|by \d{1,2}(?::\d{2})?\s?(?:am|pm)?|\d{1,2}(?:st|nd|rd|th)|\d{1,2}\/\d{1,2})\b/i
const vagueTimeRe = /\b(asap|soon|when you (?:get a chance|can|have a sec(?:ond)?)|at some point|shortly|whenever|in a bit)\b/i
const vagueScopeRe = /\b(quick(?:ly)?|small|a few|bits|stuff|polish|tidy up|have a look|touch base|circle back|some thoughts)\b/i
const vagueRefRe = /\b(the usual|as discussed|like last time|the thing|you know the one|that thing)\b/i
const outputRe = /\b(doc|document|deck|slides|report|email|summary|list|spreadsheet|sheet|outline|draft|notes|checklist|plan|figures|numbers|proposal|message)\b/i

export const splitSentences = (text: string) =>
  text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)

function toAction(sentence: string) {
  let s = sentence
    .replace(/^(hi|hey|hello)[^,.!]*[,.!]\s*/i, '')
    .replace(/^(so|also|and|oh|btw|just)\s*,?\s*/i, '')
    .replace(/^(can|could|would) you (please )?/i, '')
    .replace(/^please\s+/i, '')
    .replace(/^(i|we) need you to\s+/i, '')
    .replace(/^you (should|need to|must)\s+/i, '')
    .replace(/^(it would be great if you could|make sure (?:to|you)?)\s*/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return s
}

export function analyse(text: string): Analysis {
  const sentences = splitSentences(text)
  const requests = sentences.filter(s => requestRe.test(s))
  const required: Sourced[] = requests.map(s => ({ id: uid(), text: toAction(s), source: s }))
  const unclear: Sourced[] = []
  const questions: Sourced[] = []
  const add = (u: string, q: string, source?: string) => {
    unclear.push({ id: uid(), text: u, source })
    questions.push({ id: uid(), text: q, source })
  }

  const dated = sentences.find(s => dateRe.test(s))
  if (dated) {
    required.push({ id: uid(), text: `Timing mentioned: “${dated.match(dateRe)![0]}”`, source: dated })
  }

  for (const s of sentences) {
    const vt = s.match(vagueTimeRe)
    if (vt) add(`“${vt[0]}” is not a specific time.`, `When you say “${vt[0]}”, which day and time do you mean?`, s)
    const vs = s.match(vagueScopeRe)
    if (vs) add(`“${vs[0]}” does not say how much work is expected.`, `How much detail are you expecting here? Roughly how long should I spend on it?`, s)
    const vr = s.match(vagueRefRe)
    if (vr) add(`“${vr[0]}” refers to something not described in this message.`, `Could you point me to what “${vr[0]}” refers to?`, s)
  }

  if (!dated && !unclear.some(u => u.text.includes('specific time'))) {
    add('No deadline is stated.', 'When do you need this by? A specific day and time would help me plan.')
  }
  if (/\bwe\b/i.test(text) && !/\byou\b/i.test(text)) {
    add('“We” is used, so it is not clear who specifically is responsible.', 'Who should own this — me, or someone else on the team?')
  } else if (!/\b(you|i|we)\b/i.test(text) && requests.length) {
    add('It is not stated who should do this.', 'Should I be the one to do this?')
  }
  if (requests.length && !outputRe.test(text)) {
    add('The expected output or format is not stated.', 'What format should the result be in — for example a document, a message, or slides?')
  }
  if (!requests.length) {
    add('No direct request was found. This may be information only.', 'Is there anything you would like me to do with this?')
  }

  const interpretation: Sourced[] = required.length && requests.length
    ? [
        { id: uid(), text: `This appears to ask you to: ${required[0].text.charAt(0).toLowerCase()}${required[0].text.slice(1)}.`, source: requests[0] },
        ...(requests.length > 1 ? [{ id: uid(), text: `It may also involve ${requests.length - 1} related request${requests.length > 2 ? 's' : ''} listed under What is required.` }] : []),
      ]
    : [{ id: uid(), text: 'This appears to be sharing information rather than asking for action. That may not be the sender’s intent.' }]

  const next: Step[] = []
  if (questions.length) next.push({ id: uid(), text: 'Send clarification questions and wait for answers', minutes: 10, doneWhen: 'The sender has confirmed the unclear points.' })
  requests.forEach(r => next.push({ id: uid(), text: toAction(r), minutes: 30, doneWhen: 'The result exists and matches what was asked.', source: r }))
  if (requests.length) next.push({ id: uid(), text: 'Share the result and confirm it meets the request', minutes: 10, doneWhen: 'The sender has acknowledged receipt.' })

  return { interpretation, required, unclear, questions, next, sentences }
}

export function draftMessage(text: string, opts: { audience: string; tone: 'warm' | 'neutral' | 'direct'; keep: string; avoid: string }) {
  let body = splitSentences(text).map(s => s.charAt(0).toUpperCase() + s.slice(1)).map(s => (/[.!?]$/.test(s) ? s : `${s}.`))
  const avoid = opts.avoid.split(',').map(a => a.trim()).filter(Boolean)
  body = body.map(s => avoid.reduce((acc, a) => acc.replace(new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '').replace(/\s{2,}/g, ' '), s))
  const keep = opts.keep.split(',').map(k => k.trim()).filter(Boolean)
  const missingKeep = keep.filter(k => !body.join(' ').toLowerCase().includes(k.toLowerCase()))
  const name = opts.audience.trim() || 'there'
  const open = opts.tone === 'warm' ? `Hi ${name}, I hope your week is going well.` : `Hi ${name},`
  const middle = opts.tone === 'direct' ? body.map(b => `• ${b}`).join('\n') : body.join(' ')
  const close = opts.tone === 'warm' ? 'Thank you, and let me know if anything is unclear.' : opts.tone === 'direct' ? 'Please let me know if anything is unclear.' : 'Thanks,'
  return { draft: `${open}\n\n${middle}${missingKeep.length ? `\n\n${missingKeep.join(' ')}` : ''}\n\n${close}`, removed: avoid }
}

export const example =
  `Hi! Could you pull together the numbers for the Q3 review when you get a chance? Just a quick summary is fine, like last time. We should also have a look at the onboarding checklist before Thursday.`
