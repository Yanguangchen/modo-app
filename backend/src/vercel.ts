import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { app } from './http.js'

// All API paths target one concrete function. Vercel preserves the incoming URL;
// also accept the /api-prefixed aliases used by older deployments.
const gateway = new Hono()
gateway.all('*', c => {
  const url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/'
  return app.fetch(new Request(url, c.req.raw))
})

export default handle(gateway)
