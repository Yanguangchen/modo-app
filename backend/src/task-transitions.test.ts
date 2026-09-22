import { describe, expect, it } from 'vitest'
import { TRANSITIONS } from './routes/tasks.js'

describe('task undo transitions', () => {
  it('allows every supported transition to be reversed after syncing', () => {
    for (const [from, destinations] of Object.entries(TRANSITIONS)) {
      for (const to of destinations) expect(TRANSITIONS[to], `${from} → ${to} must be reversible`).toContain(from)
    }
  })
})
