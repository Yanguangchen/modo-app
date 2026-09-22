import { serve } from '@hono/node-server'
import { generateJson } from './ai.js'
import { createApp } from './app.js'
import { requireAuth } from './auth.js'
import { assertBootable, config } from './config.js'
import { log } from './log.js'

assertBootable()

const app = createApp({ generate: generateJson, authenticate: requireAuth })

serve({ fetch: app.fetch, port: config.port }, info => {
  log('INFO', 'listening', { port: info.port, model: config.vertexModel, mfa: config.mfaRequired })
})
