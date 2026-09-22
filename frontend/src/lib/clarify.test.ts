import { describe, expect, it } from 'vitest'
import { analyse, draftMessage, example, modes, splitSentences } from './clarify'

describe('clarify modes & splitSentences', () => {
  it('exports valid modes metadata', () => {
    expect(modes.map(m => m.id)).toEqual(['explicit', 'breakdown', 'say', 'cards', 'mindmap', 'conversation'])
  })

  it('splits sentences correctly on punctuation and newlines', () => {
    expect(splitSentences('First sentence. Second sentence! Third?\nFourth.')).toEqual([
      'First sentence.',
      'Second sentence!',
      'Third?',
      'Fourth.',
    ])
  })
})

describe('analyse', () => {
  it('keeps the original sentence beside the action it extracted', () => {
    const sentence = 'Could you send the report by Friday?'
    const result = analyse(sentence)
    const action = result.required.find(item => item.source === sentence)
    expect(action?.text.toLowerCase()).toContain('send the report')
    expect(result.sentences).toEqual([sentence])
  })

  it('asks about a vague time instead of inventing a deadline', () => {
    const result = analyse('Could you send the summary ASAP?')
    expect(result.unclear.some(item => item.text.toLowerCase().includes('asap'))).toBe(true)
    expect(result.questions.some(item => item.text.toLowerCase().includes('asap'))).toBe(true)
    expect(result.required.every(item => !/\d{1,2}:\d{2}/.test(item.text))).toBe(true)
  })

  it('detects vague scope and vague references', () => {
    const result = analyse('Could you do a quick tidy up of the presentation like last time?')
    expect(result.unclear.some(u => u.text.includes('does not say how much work'))).toBe(true)
    expect(result.unclear.some(u => u.text.includes('refers to something not described'))).toBe(true)
  })

  it('flags missing output format when request does not mention document/report/etc', () => {
    const result = analyse('Could you follow up with marketing by Friday?')
    expect(result.unclear.some(u => u.text.includes('The expected output or format is not stated.'))).toBe(true)
    expect(result.questions.some(q => q.text.includes('What format should the result be in'))).toBe(true)
  })

  it('flags unassigned owner when no personal pronoun is present in a request', () => {
    const result = analyse('Please update the spreadsheet.')
    expect(result.unclear.some(u => u.text === 'It is not stated who should do this.')).toBe(true)
    expect(result.questions.some(q => q.text === 'Should I be the one to do this?')).toBe(true)
  })

  it('marks a missing deadline as unknown', () => {
    const result = analyse('Please send the report.')
    expect(result.unclear.some(item => item.text === 'No deadline is stated.')).toBe(true)
    expect(result.questions.some(item => item.text.startsWith('When do you need this by?'))).toBe(true)
  })

  it('asks who owns work that only says we', () => {
    const result = analyse('We should update the checklist.')
    expect(result.unclear.some(item => item.text.includes('“We”'))).toBe(true)
  })

  it('treats information without a request as unclear rather than an assignment', () => {
    const result = analyse('The office is closed on Monday.')
    expect(result.unclear.some(item => item.text.startsWith('No direct request'))).toBe(true)
    expect(result.interpretation[0].text).toContain('sharing information')
  })

  it('handles multiple requests and generates next steps', () => {
    const text = 'Could you prepare the deck by tomorrow? Can you also review the notes?'
    const result = analyse(text)
    expect(result.required.length).toBeGreaterThanOrEqual(2)
    expect(result.interpretation.some(i => i.text.includes('related request'))).toBe(true)
    expect(result.next.some(s => s.text.includes('Share the result'))).toBe(true)
  })

  it('analyses example paragraph successfully', () => {
    const result = analyse(example)
    expect(result.required.length).toBeGreaterThan(0)
    expect(result.unclear.length).toBeGreaterThan(0)
    expect(result.questions.length).toBeGreaterThan(0)
  })
})

describe('draftMessage', () => {
  it('drops avoided phrases, keeps requested ones, and follows the direct tone', () => {
    const { draft, removed } = draftMessage('Please review the jargon in the notes', {
      audience: 'Sam',
      tone: 'direct',
      keep: 'the Friday deadline',
      avoid: 'jargon',
    })
    expect(draft).toContain('Hi Sam,')
    expect(draft).toContain('• ')
    expect(draft.toLowerCase()).not.toContain('jargon')
    expect(draft).toContain('the Friday deadline')
    expect(removed).toEqual(['jargon'])
  })

  it('supports warm and neutral tones with fallback audience', () => {
    const warm = draftMessage('Here is the update', {
      audience: '',
      tone: 'warm',
      keep: '',
      avoid: '',
    })
    expect(warm.draft).toContain('Hi there, I hope your week is going well.')
    expect(warm.draft).toContain('Thank you, and let me know if anything is unclear.')

    const neutral = draftMessage('Here is the update', {
      audience: 'Alex',
      tone: 'neutral',
      keep: '',
      avoid: '',
    })
    expect(neutral.draft).toContain('Hi Alex,')
    expect(neutral.draft).toContain('Thanks,')
  })
})
