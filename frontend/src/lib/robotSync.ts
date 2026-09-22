import type { CalendarBlock, NotificationItem, Prefs } from './types'

const robotBase = (import.meta.env.VITE_ROBOT_API_BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')

async function post(path: string, body: unknown) {
  try {
    await fetch(`${robotBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return true
  } catch {
    return false
  }
}

export function syncCalendarBlockToRobot(block: CalendarBlock, prefs: Prefs) {
  if (!block.date) return Promise.resolve(false)
  return post('/robot/calendar', {
    id: block.id,
    title: block.title,
    date: block.date,
    start: block.start,
    end: block.end,
    kind: block.kind,
    reminderMinutesBefore: [prefs.reminderMinutesBefore, 0].filter((value, index, values) => values.indexOf(value) === index),
  })
}

export function syncNotificationToRobot(notification: NotificationItem) {
  return post('/robot/notifications', {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    kind: notification.kind,
    priority: notification.priority,
  })
}
