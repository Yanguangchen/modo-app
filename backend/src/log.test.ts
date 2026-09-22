import { describe, expect, it, vi } from 'vitest'
import { log } from './log.js'

describe('log', () => {
  it('formats structured JSON log to stdout', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      log('INFO', 'service_ready', { route: 'GET /healthz', status: 200 })
      expect(consoleSpy).toHaveBeenCalledTimes(1)
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(parsed).toEqual({
        severity: 'INFO',
        message: 'service_ready',
        route: 'GET /healthz',
        status: 200,
      })
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('hashes the user ID to prevent leaking raw user identifiers', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const rawUid = 'user_abc_12345'
      log('WARNING', 'rate_exceeded', { uid: rawUid, count: 5 })
      const rawLog = consoleSpy.mock.calls[0][0]
      const parsed = JSON.parse(rawLog)

      // Raw user ID must never appear in the logged JSON
      expect(rawLog).not.toContain(rawUid)
      expect(parsed.uid).toMatch(/^u_[a-z0-9]+$/)
      // Same user ID hashes deterministically
      log('INFO', 'another_event', { uid: rawUid })
      const parsed2 = JSON.parse(consoleSpy.mock.calls[1][0])
      expect(parsed2.uid).toBe(parsed.uid)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('handles log calls without uid safely', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      log('ERROR', 'boot_failure', { code: 'CRITICAL' })
      const parsed = JSON.parse(consoleSpy.mock.calls[0][0])
      expect(parsed.severity).toBe('ERROR')
      expect(parsed.message).toBe('boot_failure')
      expect(parsed.code).toBe('CRITICAL')
      expect(parsed.uid).toBeUndefined()
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
