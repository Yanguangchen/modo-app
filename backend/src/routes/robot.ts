import { Hono } from 'hono'
import { z } from 'zod'

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const id = () => Math.random().toString(36).slice(2, 10)

const CalendarBlock = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(300),
  date: yyyyMmDd,
  start: hhmm,
  end: hhmm,
  kind: z.enum(['meeting', 'focus', 'break', 'buffer']).default('focus'),
  reminderMinutesBefore: z.array(z.number().int().min(0).max(1440)).default([0]),
})

const Notification = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
  kind: z.enum(['reminder', 'system', 'decision']).default('reminder'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
})

type RobotBlock = z.infer<typeof CalendarBlock> & { id: string; createdAt: string }
type RobotNotification = z.infer<typeof Notification> & { id: string; createdAt: string; read: boolean }

const blocks: RobotBlock[] = []
const notifications: RobotNotification[] = []

export const robot = new Hono()

robot.get('/health', c => c.json({ ok: true, blocks: blocks.length, notifications: notifications.length }))

robot.get('/reminders', c => {
  const date = c.req.query('date')
  const due = date ? blocks.filter(block => block.date === date) : blocks
  return c.json({ reminders: due })
})

robot.post('/calendar', async c => {
  const b = CalendarBlock.parse(await c.req.json())
  const block = { ...b, id: b.id || id(), createdAt: new Date().toISOString() }
  const index = blocks.findIndex(item => item.id === block.id)
  if (index >= 0) blocks[index] = block
  else blocks.push(block)
  return c.json({ block }, 201)
})

robot.get('/notifications', c => c.json({ notifications }))

robot.post('/notifications', async c => {
  const n = Notification.parse(await c.req.json())
  const notification = { ...n, id: n.id || id(), read: false, createdAt: new Date().toISOString() }
  notifications.unshift(notification)
  return c.json({ notification }, 201)
})
