import { generateJson } from './ai.js'
import { createApp } from './app.js'
import { requireAuth } from './auth.js'
import { assertBootable } from './config.js'

assertBootable()

export const app = createApp({ generate: generateJson, authenticate: requireAuth })
