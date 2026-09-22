export type Theme = 'system' | 'light' | 'dark'
export type MotionPref = 'system' | 'reduced' | 'full'
export type TodayView = 'kanban' | 'timeline' | 'gantt'

export interface Prefs {
  theme: Theme
  motion: MotionPref
  solidSurfaces: boolean
  density: 'comfortable' | 'compact'
  textScale: number
  font: 'system' | 'atkinson'
  todayView: TodayView
  bufferMinutes: number
  quietStart: string
  quietEnd: string
  summaryFirst: boolean
  soundEnabled: boolean
  soundVolume: number
}

/** Execution states from spec §9.5 — all user controlled. */
export type TaskState =
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'rescheduled'
  | 'returned'

export interface Task {
  id: string
  title: string
  why?: string
  minutes: number
  state: TaskState
  /** HH:MM when placed on today's plan; undefined means it lives in the unscheduled tray. */
  start?: string
  resumeNote?: string
  /** Seconds already worked before the current run. */
  elapsed?: number
  /** Epoch ms when the current run started. */
  startedAt?: number
  /** Provenance: where this task came from (Clarify, meeting, quick capture). */
  source?: string
  doneWhen?: string
}

export type BlockKind = 'meeting' | 'focus' | 'break' | 'buffer'

export interface CalendarBlock {
  id: string
  title: string
  start: string
  end: string
  kind: BlockKind
  meetingId?: string
}

export type Audience = 'private' | 'selected' | 'team' | 'organization'

export interface GuideField {
  id: string
  label: string
  hint: string
  value: string
  audience: Audience
}

export interface AgendaItem {
  id: string
  title: string
  minutes: number
}

export interface MeetingPlan {
  id: string
  title: string
  organizer: string
  start: string
  end: string
  purpose: string
  outcome: string
  role: string
  contribution: string
  decisionOwner: string
  materials: string
  prep: string
  agenda: AgendaItem[]
  decisions: string[]
  actions: string[]
  questions: string[]
  privateNotes: string
  parkingLot: string[]
}

export interface Article {
  id: string
  title: string
  summary: string
  body: string
  owner: string
  source: string
  version: string
  lastReviewed: string
  nextReview: string
  tags: string[]
}
