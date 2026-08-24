import type {
  ActivityEntityType,
  EntityId,
  Instant,
  LocalDate,
  SyncEntity,
} from './shared'

export type TaskStatus = 'todo' | 'doing' | 'done' | 'later' | 'archived'
export type TaskPriority = 'P1' | 'P2' | 'P3'

export interface Task extends SyncEntity {
  title: string
  notes: string | null
  status: TaskStatus
  priority: TaskPriority
  plannedDate: LocalDate | null
  dueAt: Instant | null
  projectId: EntityId | null
  focusDate: LocalDate | null
  focusOrder: 1 | 2 | 3 | null
  completedAt: Instant | null
}

export type WaitingStatus = 'waiting' | 'confirmed' | 'closed'

export interface Waiting extends SyncEntity {
  title: string
  notes: string | null
  status: WaitingStatus
  person: string | null
  projectId: EntityId | null
  sourceTaskId: EntityId | null
  sentAt: Instant
  followUpDate: LocalDate | null
  confirmedAt: Instant | null
  closedAt: Instant | null
}

export type RoutineStatus = 'active' | 'paused' | 'archived'

export type RoutineSchedule =
  | { frequency: 'daily' }
  | { frequency: 'weekdays' }
  | { frequency: 'weekly'; daysOfWeek: number[] }

export interface Routine extends SyncEntity {
  title: string
  status: RoutineStatus
  schedule: RoutineSchedule
  timezone: string
  sortOrder: number
}

export interface RoutineLog extends SyncEntity {
  routineId: EntityId
  date: LocalDate
  completedAt: Instant
}

export interface Memo extends SyncEntity {
  content: string
  pinned: boolean
  projectId: EntityId | null
}

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface Project extends SyncEntity {
  name: string
  icon: string | null
  status: ProjectStatus
}

export interface DailyLogTaskSnapshot {
  entityId: EntityId
  title: string
  status: TaskStatus
  priority: TaskPriority
  projectName: string | null
  plannedDate: LocalDate | null
  dueAt: Instant | null
}

export interface DailyLogWaitingSnapshot {
  entityId: EntityId
  title: string
  status: WaitingStatus
  person: string | null
  projectName: string | null
  sentAt: Instant
  followUpDate: LocalDate | null
}

export interface DailyLogMemoSnapshot {
  entityId: EntityId
  content: string
}

export interface DailyLogRoutineSnapshot {
  entityId: EntityId
  title: string
  completedAt: Instant
}

export interface DailyLogSnapshot {
  completedTasks: DailyLogTaskSnapshot[]
  openTasks: DailyLogTaskSnapshot[]
  waiting: DailyLogWaitingSnapshot[]
  memos: DailyLogMemoSnapshot[]
  completedRoutines: DailyLogRoutineSnapshot[]
}

export interface DailyLog extends SyncEntity {
  date: LocalDate
  summary: string
  finalizedAt: Instant
  snapshot: DailyLogSnapshot
}

export type ActivityEventType =
  | 'task_created'
  | 'task_status_changed'
  | 'task_completed'
  | 'waiting_created'
  | 'waiting_confirmed'
  | 'waiting_closed'
  | 'routine_completed'
  | 'memo_created'
  | 'memo_updated'
  | 'project_status_changed'
  | 'daily_log_finalized'

export interface Activity extends SyncEntity {
  eventType: ActivityEventType
  entityType: ActivityEntityType
  entityId: EntityId
  payload: Readonly<Record<string, unknown>>
  deviceId: string | null
  occurredAt: Instant
}
