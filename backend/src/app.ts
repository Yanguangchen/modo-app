import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { z } from 'zod'
import type { Generate } from './ai.js'
import type { Caller } from './auth.js'
import { config } from './config.js'
import { openFields } from './crypto.js'
import { ApiError } from './errors.js'
import { paths } from './firebase.js'
import { GuideRequest, guideChat } from './guide.js'
import { publishedArticles } from './knowledge.js'
import { log } from './log.js'
import { rateLimit } from './rateLimit.js'
import { admin } from './routes/admin.js'
import { clarifyRoutes } from './routes/clarify.js'
import { guide, ownFields } from './routes/guide.js'
import { internal } from './routes/internal.js'
import { knowledge } from './routes/knowledge.js'
import { MEETING_SEALED, me } from './routes/me.js'
import { meetings } from './routes/meetings.js'
import { tasks } from './routes/tasks.js'
import { body, scope } from './routes/util.js'
import { proposals } from './schedule.js'
import { bootstrap, requireMember } from './tenancy.js'
import type { MemberEnv } from './tenancy.js'

export type Deps = {
  generate: Generate
  authenticate: MiddlewareHandler<{ Variables: { caller: Caller } }>
}

export function createApp({ generate, authenticate }: Deps) {
  const app = new Hono<MemberEnv>()

  app.use('*', secureHeaders())
  app.use('*', cors({ origin: config.corsOrigins, allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], maxAge: 600 }))
  app.use('*', async (c, next) => {
    const started = Date.now()
    await next()
    log(c.res.status >= 500 ? 'ERROR' : 'INFO', 'request', { route: `${c.req.method} ${c.req.routePath}`, status: c.res.status, ms: Date.now() - started, uid: c.get('caller')?.uid })
  })

  app.get('/healthz', c => c.json({ ok: true }))
  app.route('/internal', internal)

  const v1 = new Hono<MemberEnv>()
  v1.use('*', bodyLimit({ maxSize: 128 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'That is too long. Shorten it and try again.') } }))
  v1.use('*', authenticate)
  v1.use('*', rateLimit(240, 60_000))

  // The only authenticated route that works before tenant membership exists.
  v1.post('/me/bootstrap', async c => c.json(await bootstrap(c.get('caller'))))

  v1.use('*', requireMember)

  v1.route('/me', me)
  v1.route('/tasks', tasks)
  v1.route('/meetings', meetings)
  v1.route('/guide', guide)
  v1.route('/knowledge', knowledge)
  v1.route('/admin', admin)

  const ai = rateLimit(20, 60_000)
  v1.use('/transformations', ai)
  v1.use('/guide/chat', ai)
  v1.route('/', clarifyRoutes(generate))

  v1.post('/guide/chat', async c => {
    if (!config.guide.enabled) throw new ApiError(503, 'guide_disabled', 'Guide AI is turned off.')
    const req = await body(c, GuideRequest)
    const { t, u, key } = await scope(c)
    // Cloud Run fetches the authorized context; the browser never sends it.
    const [articles, fields] = await Promise.all([
      config.guide.usePublishedKnowledge && req.context.publishedKnowledge ? publishedArticles(t) : Promise.resolve([]),
      config.guide.useWorkingGuide && req.context.workingGuide ? ownFields(t, u, key) : Promise.resolve([]),
    ])
    const workingGuide = fields.filter(f => f.value.trim()).map(f => ({ label: f.label, value: f.value }))
    return c.json(await guideChat(req, generate, { articles, workingGuide }))
  })

  v1.post('/schedule/proposals', async c => {
    const b = await body(c, z.object({
      steps: z.array(z.object({ minutes: z.number().int().min(5).max(480) })).min(1).max(20),
      busy: z.array(z.tuple([z.number().int().min(0).max(1440), z.number().int().min(0).max(1440)])).max(100),
      from: z.number().int().min(0).max(1440),
      bufferMinutes: z.number().int().min(0).max(120),
      dayStart: z.number().int().min(0).max(1440).optional(),
      dayEnd: z.number().int().min(0).max(1440).optional(),
    }))
    return c.json({ options: proposals(b.busy, b.steps, b.bufferMinutes, b.from, b.dayStart, b.dayEnd) })
  })

  /** One read for the client on sign-in: preferences, tasks, meetings, guide fields. */
  v1.get('/workspace', async c => {
    const { t, u, key } = await scope(c)
    const [userSnap, taskSnap, meetingSnap, fields] = await Promise.all([
      paths.user(t, u).get(),
      paths.userCol(t, u, 'tasks').orderBy('createdAt').limit(500).get(),
      paths.userCol(t, u, 'meetings').orderBy('start').limit(200).get(),
      ownFields(t, u, key),
    ])
    const openMeeting = (d: Record<string, unknown>) => {
      const o = openFields(key, d, [...MEETING_SEALED, 'agenda']) as Record<string, unknown>
      return { ...o, agenda: typeof o.agenda === 'string' ? JSON.parse(o.agenda) : [] }
    }
    return c.json({
      preferences: userSnap.data()?.preferences ?? null,
      tasks: taskSnap.docs.map(d => openFields(key, { ...d.data(), id: d.id }, ['title', 'why', 'doneWhen', 'resumeNote', 'source'])),
      meetings: meetingSnap.docs.map(d => ({ ...openMeeting(d.data()), id: d.id })),
      guide: fields,
    })
  })

  app.route('/v1', v1)

  app.notFound(c => c.json({ code: 'not_found', message: 'Not found.' }, 404))
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ code: err.code, message: err.message }, err.status)
    log('ERROR', 'unhandled', { route: c.req.routePath, code: err.name })
    return c.json({ code: 'internal', message: 'Something went wrong. Your work is safe; try again.' }, 500)
  })
  return app
}
