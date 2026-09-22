/* Server copy of the client's proposal logic (frontend/src/lib/schedule.ts), so
   explained options can be produced by the API too (SCH05). */
export type Busy = [number, number][]
export type Strategy = 'earliest' | 'focused' | 'balanced'

export const strategies: { id: Strategy; title: string; why: string }[] = [
  { id: 'earliest', title: 'Earliest completion', why: 'Places each step in the first free gap, so the work finishes as soon as possible. Steps may be split around meetings.' },
  { id: 'focused', title: 'Lowest context switching', why: 'Keeps all steps together in one uninterrupted block, even if that starts later.' },
  { id: 'balanced', title: 'Balanced workload', why: 'Leaves a 15-minute break between steps so the day does not feel packed.' },
]

export function findSlot(busy: Busy, minutes: number, buffer: number, from: number, dayStart: number, dayEnd: number): number | null {
  let cursor = Math.max(from, dayStart)
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    if (e <= cursor) continue
    if (s - cursor >= minutes + buffer) return cursor
    cursor = Math.max(cursor, e)
  }
  return dayEnd - cursor >= minutes ? cursor : null
}

export function propose(busy: Busy, steps: { minutes: number }[], strategy: Strategy, buffer: number, from: number, dayStart = 540, dayEnd = 1080): number[] | null {
  const taken: Busy = [...busy]
  const starts: number[] = []
  if (strategy === 'focused') {
    const s = findSlot(taken, steps.reduce((n, x) => n + x.minutes, 0), buffer, from, dayStart, dayEnd)
    if (s == null) return null
    let c = s
    for (const step of steps) { starts.push(c); c += step.minutes }
    return starts
  }
  let cursor = from
  for (const step of steps) {
    const s = findSlot(taken, step.minutes, buffer, cursor, dayStart, dayEnd)
    if (s == null) return null
    starts.push(s)
    taken.push([s, s + step.minutes])
    cursor = s + step.minutes + (strategy === 'balanced' ? 15 : 0)
  }
  return starts
}

/** Two or three explained options; one when only one arrangement is viable. */
export function proposals(busy: Busy, steps: { minutes: number }[], buffer: number, from: number, dayStart?: number, dayEnd?: number) {
  const seen = new Set<string>()
  return strategies
    .map(s => ({ ...s, starts: propose(busy, steps, s.id, buffer, from, dayStart, dayEnd) }))
    .filter(o => {
      if (!o.starts) return false
      const k = o.starts.join(',')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}
