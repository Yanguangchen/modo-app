import type { CalendarBlock, Task } from './types'
import { addMinutes, nowMinutes, toMinutes } from './time'

export type Busy = [number, number][]

const DAY_START = toMinutes('09:00')
const DAY_END = toMinutes('18:00')

export function busyFrom(tasks: Task[], blocks: CalendarBlock[]): Busy {
  const fromTasks = tasks
    .filter(t => t.start && t.state !== 'completed' && t.state !== 'rescheduled')
    .map(t => [toMinutes(t.start!), toMinutes(addMinutes(t.start!, t.minutes))] as [number, number])
  return [...blocks.map(b => [toMinutes(b.start), toMinutes(b.end)] as [number, number]), ...fromTasks].sort((a, b) => a[0] - b[0])
}

/** Earliest gap ≥ minutes (+buffer before the next item) starting at `from`. */
export function findSlot(busy: Busy, minutes: number, buffer: number, from = earliestStart()): number | null {
  let cursor = Math.max(from, DAY_START)
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    if (e <= cursor) continue
    if (s - cursor >= minutes + buffer) return cursor
    cursor = Math.max(cursor, e)
  }
  return DAY_END - cursor >= minutes ? cursor : null
}

export function earliestStart() {
  return Math.max(DAY_START, Math.ceil(nowMinutes() / 5) * 5)
}

export type Strategy = 'earliest' | 'focused' | 'balanced'

export const strategies: { id: Strategy; title: string; why: string }[] = [
  { id: 'earliest', title: 'Earliest completion', why: 'Places each step in the first free gap, so the work finishes as soon as possible. Steps may be split around meetings.' },
  { id: 'focused', title: 'Lowest context switching', why: 'Keeps all steps together in one uninterrupted block, even if that starts later.' },
  { id: 'balanced', title: 'Balanced workload', why: 'Leaves a 15-minute break between steps so the day does not feel packed.' },
]

/** Returns start minutes for each step, or null if it does not fit in the day. */
export function propose(busy: Busy, steps: { minutes: number }[], strategy: Strategy, buffer: number, from = earliestStart()): number[] | null {
  const taken: Busy = [...busy]
  const starts: number[] = []
  if (strategy === 'focused') {
    const total = steps.reduce((n, s) => n + s.minutes, 0)
    const s = findSlot(taken, total, buffer, from)
    if (s == null) return null
    let c = s
    for (const step of steps) { starts.push(c); c += step.minutes }
    return starts
  }
  let cursor = from
  for (const step of steps) {
    const s = findSlot(taken, step.minutes, buffer, cursor)
    if (s == null) return null
    starts.push(s)
    taken.push([s, s + step.minutes])
    cursor = s + step.minutes + (strategy === 'balanced' ? 15 : 0)
  }
  return starts
}
