import { describe, expect, it, vi } from 'vitest'
import { addMinutes, formatDuration, fromMinutes, nowMinutes, toMinutes, uid } from './time'

describe('time', () => {
  it('converts clock times to minutes and back', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(0)).toBe('00:00')
  })

  it('adds minutes across an hour boundary', () => {
    expect(addMinutes('17:50', 20)).toBe('18:10')
  })

  it('formats durations in minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(120)).toBe('2 h')
  })

  it('computes nowMinutes based on current Date hours and minutes', () => {
    vi.useFakeTimers()
    try {
      const fixed = new Date(2026, 8, 23, 14, 35, 0)
      vi.setSystemTime(fixed)
      expect(nowMinutes()).toBe(14 * 60 + 35)
    } finally {
      vi.useRealTimers()
    }
  })

  it('generates non-empty unique alphanumeric IDs via uid()', () => {
    const id1 = uid()
    const id2 = uid()
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThanOrEqual(6)
    expect(id1).not.toBe(id2)
  })
})
