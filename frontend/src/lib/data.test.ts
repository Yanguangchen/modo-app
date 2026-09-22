import { describe, expect, it } from 'vitest'
import { articles, defaultPrefs, seedBlocks, seedGuide, seedMeetings, seedTasks, weekPlan } from './data'

describe('data seeds and integrity', () => {
  it('provides complete default preferences', () => {
    expect(defaultPrefs.theme).toBe('system')
    expect(defaultPrefs.motion).toBe('system')
    expect(defaultPrefs.soundEnabled).toBe(false)
    expect(defaultPrefs.soundVolume).toBe(0.7)
    expect(defaultPrefs.bufferMinutes).toBeGreaterThan(0)
  })

  it('provides well-formed calendar blocks with non-inverted time spans', () => {
    expect(seedBlocks.length).toBeGreaterThan(0)
    for (const block of seedBlocks) {
      expect(block.id).toBeTruthy()
      expect(block.title).toBeTruthy()
      expect(block.start).toMatch(/^\d{2}:\d{2}$/)
      expect(block.end).toMatch(/^\d{2}:\d{2}$/)
      expect(block.start < block.end).toBe(true)
    }
  })

  it('provides seed tasks with positive durations and valid states', () => {
    expect(seedTasks.length).toBeGreaterThan(0)
    for (const task of seedTasks) {
      expect(task.id).toBeTruthy()
      expect(task.title).toBeTruthy()
      expect(task.minutes).toBeGreaterThan(0)
      expect(['planned', 'ready', 'in_progress', 'completed', 'rescheduled']).toContain(task.state)
    }
  })

  it('provides working guide seed items with valid labels and audience settings', () => {
    expect(seedGuide.length).toBeGreaterThan(0)
    for (const field of seedGuide) {
      expect(field.id).toBeTruthy()
      expect(field.label).toBeTruthy()
      expect(['organization', 'team', 'selected', 'private']).toContain(field.audience)
    }
  })

  it('provides meeting plans linked to calendar blocks with titles', () => {
    expect(seedMeetings.length).toBeGreaterThan(0)
    for (const meeting of seedMeetings) {
      expect(meeting.id).toBeTruthy()
      expect(meeting.title).toBeTruthy()
      expect(meeting.start).toMatch(/^\d{2}:\d{2}$/)
      expect(meeting.end).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('provides knowledge articles with required metadata', () => {
    expect(articles.length).toBeGreaterThan(0)
    for (const article of articles) {
      expect(article.id).toBeTruthy()
      expect(article.title).toBeTruthy()
      expect(article.owner).toBeTruthy()
      expect(article.tags.length).toBeGreaterThan(0)
    }
  })

  it('provides week plan entries for Monday through Friday', () => {
    expect(weekPlan.map(w => w.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
  })
})
