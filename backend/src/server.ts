import { serve } from '@hono/node-server'
import { config } from './config.js'
import { app } from './http.js'
import { log } from './log.js'

serve({ fetch: app.fetch, port: config.port }, info => {
  log('INFO', 'listening', { port: info.port, model: config.geminiModel })
})
