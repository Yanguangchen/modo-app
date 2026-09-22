import { describe, expect, it, vi } from 'vitest'

vi.mock('./http.js', async () => {
  const { Hono } = await import('hono')
  const app = new Hono()
  app.get('/healthz', c => c.json({ ok: true }))
  app.post('/v1/transformations', async c => c.json({
    body: await c.req.json(),
    authorization: c.req.header('authorization'),
    query: c.req.query('mode'),
  }))
  app.post('/v1/me/bootstrap', c => c.json({ error: 'unauthorized' }, 401))
  return { app }
})

import entrypoint from '../../api/index.js'

describe('Vercel Web Standard entrypoint', () => {
  it.each(['/healthz', '/api/healthz'])('serves health at %s', async path => {
    const response = await entrypoint.fetch(new Request(`https://modo.test${path}`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it.each(['/v1/transformations', '/api/v1/transformations'])(
    'preserves POST body, auth header and query at %s', async path => {
      const response = await entrypoint.fetch(new Request(`https://modo.test${path}?mode=clarify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-only' },
        body: JSON.stringify({ text: 'test' }),
      }))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        body: { text: 'test' }, authorization: 'Bearer test-only', query: 'clarify',
      })
    },
  )

  it('preserves nested route status codes', async () => {
    const response = await entrypoint.fetch(new Request('https://modo.test/v1/me/bootstrap', { method: 'POST' }))
    expect(response.status).toBe(401)
  })
})
