import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { SyncEntity, UserId } from '@/domain/shared'
import { isIanaTimezone, isLocalDate, isUtcInstant } from '@/domain/time'
import { InvalidPersistedEntityError, RepositoryOwnershipError } from './errors'

const taskStatuses = ['todo', 'doing', 'done', 'later', 'archived'] as const
const taskPriorities = ['P1', 'P2', 'P3'] as const
const waitingStatuses = ['waiting', 'confirmed', 'closed'] as const
const routineStatuses = ['active', 'paused', 'archived'] as const
const activityEntityTypes = [
  'task',
  'waiting',
  'routine',
  'memo',
  'project',
  'daily_log',
] as const
const activityEventTypes = [
  'task_created',
  'task_completed',
  'task_reopened',
  'task_focus_set',
  'task_focus_removed',
  'waiting_created',
  'waiting_confirmed',
  'waiting_closed',
  'waiting_reopened',
  'waiting_followup_changed',
  'routine_completed',
  'routine_completion_undone',
  'memo_created',
  'memo_updated',
  'memo_pinned',
  'memo_unpinned',
  'project_status_changed',
  'daily_log_finalized',
] as const

function invalid(entityType: string, field: string): never {
  throw new InvalidPersistedEntityError(entityType, field)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertString(
  value: unknown,
  entityType: string,
  field: string,
  allowEmpty = true,
): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    invalid(entityType, field)
  }
}

export function assertUserId(value: unknown): asserts value is UserId {
  assertString(value, 'Repository request', 'userId', false)
}

function assertEntityId(
  value: unknown,
  entityType: string,
  field = 'id',
): asserts value is string {
  assertString(value, entityType, field, false)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) invalid(entityType, field)
}

function assertInstant(
  value: unknown,
  entityType: string,
  field: string,
  nullable = false,
): void {
  if (nullable && value === null) return
  if (!isUtcInstant(value)) invalid(entityType, field)
}

function assertLocalDate(
  value: unknown,
  entityType: string,
  field: string,
  nullable = false,
): void {
  if (nullable && value === null) return
  if (!isLocalDate(value)) invalid(entityType, field)
}

export function assertTimezone(
  value: unknown,
  entityType: string,
  field: string,
): asserts value is string {
  if (!isIanaTimezone(value)) invalid(entityType, field)
}

function assertNullableId(
  value: unknown,
  entityType: string,
  field: string,
): void {
  if (value !== null) assertEntityId(value, entityType, field)
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  entityType: string,
  field: string,
): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    invalid(entityType, field)
  }
}

function assertSyncEntity(value: unknown, entityType: string): SyncEntity {
  if (!isRecord(value)) invalid(entityType, 'entity')
  assertEntityId(value.id, entityType)
  assertString(value.userId, entityType, 'userId', false)
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    invalid(entityType, 'version')
  }
  assertInstant(value.createdAt, entityType, 'createdAt')
  assertInstant(value.updatedAt, entityType, 'updatedAt')
  assertInstant(value.deletedAt, entityType, 'deletedAt', true)
  return value as unknown as SyncEntity
}

export function assertRepositoryOwner(
  userId: UserId,
  entity: Pick<SyncEntity, 'userId'>,
): void {
  assertUserId(userId)
  if (entity.userId !== userId) {
    throw new RepositoryOwnershipError(userId, entity.userId)
  }
}

export function validateTask(value: unknown): Task {
  const task = assertSyncEntity(value, 'Task') as Task
  assertString(task.title, 'Task', 'title', false)
  if (task.notes !== null) assertString(task.notes, 'Task', 'notes')
  assertEnum(task.status, taskStatuses, 'Task', 'status')
  assertEnum(task.priority, taskPriorities, 'Task', 'priority')
  assertLocalDate(task.plannedDate, 'Task', 'plannedDate', true)
  assertInstant(task.dueAt, 'Task', 'dueAt', true)
  assertNullableId(task.projectId, 'Task', 'projectId')
  assertLocalDate(task.focusDate, 'Task', 'focusDate', true)
  if (task.focusOrder !== null && ![1, 2, 3].includes(task.focusOrder)) {
    invalid('Task', 'focusOrder')
  }
  assertInstant(task.completedAt, 'Task', 'completedAt', true)
  return task
}

export function validateWaiting(value: unknown): Waiting {
  const waiting = assertSyncEntity(value, 'Waiting') as Waiting
  assertString(waiting.title, 'Waiting', 'title', false)
  if (waiting.notes !== null) assertString(waiting.notes, 'Waiting', 'notes')
  assertEnum(waiting.status, waitingStatuses, 'Waiting', 'status')
  if (waiting.person !== null) assertString(waiting.person, 'Waiting', 'person')
  assertNullableId(waiting.projectId, 'Waiting', 'projectId')
  assertNullableId(waiting.sourceTaskId, 'Waiting', 'sourceTaskId')
  assertInstant(waiting.sentAt, 'Waiting', 'sentAt')
  assertLocalDate(waiting.followUpDate, 'Waiting', 'followUpDate', true)
  assertInstant(waiting.confirmedAt, 'Waiting', 'confirmedAt', true)
  assertInstant(waiting.closedAt, 'Waiting', 'closedAt', true)
  return waiting
}

export function validateMemo(value: unknown): Memo {
  const memo = assertSyncEntity(value, 'Memo') as Memo
  assertString(memo.content, 'Memo', 'content', false)
  if (typeof memo.pinned !== 'boolean') invalid('Memo', 'pinned')
  assertNullableId(memo.projectId, 'Memo', 'projectId')
  return memo
}

export function validateRoutine(value: unknown): Routine {
  const routine = assertSyncEntity(value, 'Routine') as Routine
  assertString(routine.title, 'Routine', 'title', false)
  assertEnum(routine.status, routineStatuses, 'Routine', 'status')
  assertTimezone(routine.timezone, 'Routine', 'timezone')
  if (!Number.isFinite(routine.sortOrder)) invalid('Routine', 'sortOrder')
  if (!isRecord(routine.schedule)) invalid('Routine', 'schedule')
  const frequency = routine.schedule.frequency
  if (!['daily', 'weekdays', 'weekly'].includes(frequency)) {
    invalid('Routine', 'schedule.frequency')
  }
  if (frequency === 'weekly') {
    const days = routine.schedule.daysOfWeek
    if (
      !Array.isArray(days) ||
      days.length === 0 ||
      new Set(days).size !== days.length ||
      days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
    ) {
      invalid('Routine', 'schedule.daysOfWeek')
    }
  }
  return routine
}

export function validateRoutineLog(value: unknown): RoutineLog {
  const log = assertSyncEntity(value, 'RoutineLog') as RoutineLog
  assertEntityId(log.routineId, 'RoutineLog', 'routineId')
  assertLocalDate(log.date, 'RoutineLog', 'date')
  assertInstant(log.completedAt, 'RoutineLog', 'completedAt')
  return log
}

export function validateActivity(value: unknown): Activity {
  const activity = assertSyncEntity(value, 'Activity') as Activity
  assertEnum(activity.eventType, activityEventTypes, 'Activity', 'eventType')
  assertEnum(activity.entityType, activityEntityTypes, 'Activity', 'entityType')
  assertEntityId(activity.entityId, 'Activity', 'entityId')
  if (!isRecord(activity.payload)) invalid('Activity', 'payload')
  if (activity.deviceId !== null) {
    assertString(activity.deviceId, 'Activity', 'deviceId', false)
  }
  assertInstant(activity.occurredAt, 'Activity', 'occurredAt')
  return activity
}

export function validateDailyLog(value: unknown): DailyLog {
  const log = assertSyncEntity(value, 'DailyLog') as DailyLog
  assertLocalDate(log.date, 'DailyLog', 'date')
  assertTimezone(log.finalizeTimezone, 'DailyLog', 'finalizeTimezone')
  assertString(log.summary, 'DailyLog', 'summary')
  assertInstant(log.finalizedAt, 'DailyLog', 'finalizedAt')
  if (!isRecord(log.snapshot)) invalid('DailyLog', 'snapshot')
  for (const field of [
    'completedTasks',
    'openTasks',
    'waiting',
    'memos',
    'routines',
  ]) {
    if (!Array.isArray(log.snapshot[field as keyof typeof log.snapshot])) {
      invalid('DailyLog', `snapshot.${field}`)
    }
  }
  for (const task of [
    ...log.snapshot.completedTasks,
    ...log.snapshot.openTasks,
  ]) {
    if (!isRecord(task)) invalid('DailyLog', 'snapshot.task')
    assertEntityId(task.entityId, 'DailyLog', 'snapshot.task.entityId')
    assertString(task.title, 'DailyLog', 'snapshot.task.title', false)
    assertEnum(task.status, taskStatuses, 'DailyLog', 'snapshot.task.status')
    assertEnum(
      task.priority,
      taskPriorities,
      'DailyLog',
      'snapshot.task.priority',
    )
    if (task.projectName !== null) {
      assertString(task.projectName, 'DailyLog', 'snapshot.task.projectName')
    }
    assertLocalDate(
      task.plannedDate,
      'DailyLog',
      'snapshot.task.plannedDate',
      true,
    )
    assertInstant(task.dueAt, 'DailyLog', 'snapshot.task.dueAt', true)
  }
  for (const waiting of log.snapshot.waiting) {
    if (!isRecord(waiting)) invalid('DailyLog', 'snapshot.waiting')
    assertEntityId(waiting.entityId, 'DailyLog', 'snapshot.waiting.entityId')
    assertString(waiting.title, 'DailyLog', 'snapshot.waiting.title', false)
    assertEnum(
      waiting.status,
      waitingStatuses,
      'DailyLog',
      'snapshot.waiting.status',
    )
    if (waiting.person !== null) {
      assertString(waiting.person, 'DailyLog', 'snapshot.waiting.person')
    }
    if (waiting.projectName !== null) {
      assertString(
        waiting.projectName,
        'DailyLog',
        'snapshot.waiting.projectName',
      )
    }
    assertInstant(waiting.sentAt, 'DailyLog', 'snapshot.waiting.sentAt')
    assertLocalDate(
      waiting.followUpDate,
      'DailyLog',
      'snapshot.waiting.followUpDate',
      true,
    )
  }
  for (const memo of log.snapshot.memos) {
    if (!isRecord(memo)) invalid('DailyLog', 'snapshot.memo')
    assertEntityId(memo.entityId, 'DailyLog', 'snapshot.memo.entityId')
    assertString(memo.content, 'DailyLog', 'snapshot.memo.content')
  }
  for (const routine of log.snapshot.routines) {
    if (!isRecord(routine)) invalid('DailyLog', 'snapshot.routine')
    assertEntityId(routine.entityId, 'DailyLog', 'snapshot.routine.entityId')
    assertString(routine.title, 'DailyLog', 'snapshot.routine.title', false)
    if (typeof routine.completed !== 'boolean') {
      invalid('DailyLog', 'snapshot.routine.completed')
    }
    assertInstant(
      routine.completedAt,
      'DailyLog',
      'snapshot.routine.completedAt',
      true,
    )
  }
  return log
}
