import { describe, expect, it, vi } from 'vitest'
import { busyFrom, earliestStart, findSlot, propose, strategies } from './schedule'
import type { CalendarBlock, Task } from './types'

const block = (start: string, end: string): CalendarBlock => ({
  id: start,
  title: 'Busy',
  start,
  end,
  kind: 'meeting',
})

const task = (partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  minutes: 30,
  state: 'planned',
  ...partial,
})

describe('earliestStart', () => {
  it('clamps to DAY_START (09:00 / 540m) if current time is earlier than 9 AM', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 23, 7, 30))
      expect(earliestStart()).toBe(9 * 60)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rounds up to the nearest 5-minute block during the working day', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 23, 11, 22))
      // 11:22 is 682m, rounded up to 5 min -> 685m (11:25)
      expect(earliestStart()).toBe(11 * 60 + 25)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('findSlot', () => {
  it('skips a gap that cannot hold the task and the buffer before the next item', () => {
    const busy: [number, number][] = [[9 * 60, 10 * 60], [10 * 60 + 30, 12 * 60]]
    expect(findSlot(busy, 30, 15, 9 * 60)).toBe(12 * 60)
  })

  it('returns null when the task does not fit before the end of the day', () => {
    expect(findSlot([], 30, 0, 17 * 60 + 50)).toBeNull()
  })

  it('uses default earliestStart() if from argument is omitted', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 23, 9, 0))
      const slot = findSlot([], 30, 0)
      expect(slot).toBe(9 * 60)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('propose', () => {
  const steps = [{ minutes: 30 }, { minutes: 30 }]

  it('places earliest steps in the first free gaps', () => {
    expect(propose([blockMinutes()], steps, 'earliest', 0, 9 * 60)).toEqual([11 * 60, 11 * 60 + 30])
  })

  it('keeps focused steps in one uninterrupted block', () => {
    expect(propose([], steps, 'focused', 0, 10 * 60)).toEqual([10 * 60, 10 * 60 + 30])
  })

  it('leaves a 15 minute break between balanced steps', () => {
    expect(propose([], steps, 'balanced', 0, 9 * 60)).toEqual([9 * 60, 9 * 60 + 45])
  })

  it('returns null instead of scheduling past the work day for focused', () => {
    expect(propose([], [{ minutes: 90 }], 'focused', 0, 17 * 60)).toBeNull()
  })

  it('returns null when steps cannot fit into remaining slots for earliest or balanced', () => {
    expect(propose([], [{ minutes: 60 }, { minutes: 60 }], 'earliest', 0, 17 * 60)).toBeNull()
    expect(propose([], [{ minutes: 40 }, { minutes: 40 }], 'balanced', 0, 17 * 60)).toBeNull()
  })

  it('uses default earliestStart when from is not specified', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 8, 23, 9, 0))
      const res = propose([], [{ minutes: 30 }], 'earliest', 0)
      expect(res).toEqual([9 * 60])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('busyFrom', () => {
  it('includes calendar blocks and placed tasks, and skips finished or unscheduled work', () => {
    const busy = busyFrom(
      [
        task({ id: 'a', title: 'Placed', start: '10:00', minutes: 30 }),
        task({ id: 'b', title: 'Done', start: '11:00', state: 'completed' }),
        task({ id: 'c', title: 'Moved', start: '12:00', state: 'rescheduled' }),
        task({ id: 'd', title: 'Tray' }),
      ],
      [block('09:00', '09:30')],
    )
    expect(busy).toEqual([
      [9 * 60, 9 * 60 + 30],
      [10 * 60, 10 * 60 + 30],
    ])
  })
})

describe('strategies', () => {
  it('defines 3 scheduling strategies', () => {
    expect(strategies.map(s => s.id)).toEqual(['earliest', 'focused', 'balanced'])
  })
})

function blockMinutes(): [number, number] {
  return [9 * 60, 11 * 60]
}
