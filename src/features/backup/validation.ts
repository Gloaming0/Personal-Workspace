import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { UserId } from '@/domain/shared'
import { isUtcInstant } from '@/domain/time'
import {
  validateActivity,
  validateDailyLog,
  validateMemo,
  validateRoutine,
  validateRoutineLog,
  validateTask,
  validateWaiting,
} from '@/repositories/validation'
import { BackupError } from './errors'
import {
  backupFormat,
  currentBackupFormatVersion,
  type BackupData,
  type DailyWorkBackup,
} from './format'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(code: ConstructorParameters<typeof BackupError>[0]): never {
  throw new BackupError(code)
}

function requireUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    invalid('invalid-entity')
  }
}

function requireNullableUuid(value: unknown): void {
  if (value !== null) requireUuid(value)
}

function validateOwnedCollection<T extends { id: string; userId: UserId }>(
  value: unknown,
  userId: UserId,
  validator: (row: unknown) => T,
  validateReferences: (entity: T) => void = () => undefined,
): T[] {
  if (!Array.isArray(value)) invalid('invalid-structure')
  const ids = new Set<string>()
  return value.map((row) => {
    let entity: T
    try {
      entity = validator(row)
    } catch (error) {
      throw new BackupError('invalid-entity', { cause: error })
    }
    requireUuid(entity.id)
    if (entity.userId !== userId) invalid('wrong-owner')
    if (ids.has(entity.id)) invalid('integrity-violation')
    ids.add(entity.id)
    validateReferences(entity)
    return structuredClone(entity)
  })
}

function assertActivityPayload(activity: Activity): void {
  const { payload } = activity
  if (
    typeof payload.title !== 'string' ||
    payload.entityId !== activity.entityId
  ) {
    invalid('invalid-entity')
  }
  requireUuid(activity.entityId)
  if ('projectId' in payload) requireUuid(payload.projectId)
}

function assertDailyLogSnapshotIds(log: DailyLog): void {
  const snapshots = [
    ...log.snapshot.completedTasks,
    ...log.snapshot.openTasks,
    ...log.snapshot.waiting,
    ...log.snapshot.memos,
    ...log.snapshot.routines,
  ]
  snapshots.forEach((snapshot) => requireUuid(snapshot.entityId))
}

function entityIds(data: BackupData) {
  return {
    task: new Set(data.tasks.map((entity) => entity.id)),
    waiting: new Set(data.waiting.map((entity) => entity.id)),
    memo: new Set(data.memos.map((entity) => entity.id)),
    routine: new Set(data.routines.map((entity) => entity.id)),
    daily_log: new Set(data.dailyLogs.map((entity) => entity.id)),
  }
}

function assertReferences(data: BackupData): void {
  const ids = entityIds(data)
  for (const waiting of data.waiting) {
    if (waiting.sourceTaskId && !ids.task.has(waiting.sourceTaskId)) {
      invalid('invalid-reference')
    }
  }
  for (const log of data.routineLogs) {
    if (!ids.routine.has(log.routineId)) invalid('invalid-reference')
  }
  for (const activity of data.activities) {
    if (activity.entityType === 'project') continue
    const targetIds = ids[activity.entityType]
    if (!targetIds?.has(activity.entityId)) invalid('invalid-reference')
  }
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

function assertEffectiveInvariants(data: BackupData): void {
  const focusGroups = new Map<string, number[]>()
  for (const task of data.tasks) {
    if (
      task.deletedAt !== null ||
      task.focusDate === null ||
      task.focusOrder === null ||
      !['todo', 'doing'].includes(task.status)
    )
      continue
    const key = `${task.userId}:${task.focusDate}`
    focusGroups.set(key, [...(focusGroups.get(key) ?? []), task.focusOrder])
  }
  if (
    [...focusGroups.values()].some(
      (orders) => orders.length > 3 || new Set(orders).size !== orders.length,
    )
  ) {
    invalid('integrity-violation')
  }
  if (
    hasDuplicates(
      data.routineLogs
        .filter((log) => log.deletedAt === null)
        .map((log) => `${log.userId}:${log.routineId}:${log.date}`),
    ) ||
    hasDuplicates(
      data.dailyLogs
        .filter((log) => log.deletedAt === null)
        .map((log) => `${log.userId}:${log.date}`),
    )
  ) {
    invalid('integrity-violation')
  }
}

export function validateBackupData(value: unknown, userId: UserId): BackupData {
  if (!isRecord(value)) invalid('invalid-structure')
  const data: BackupData = {
    tasks: validateOwnedCollection<Task>(
      value.tasks,
      userId,
      validateTask,
      (task) => {
        requireNullableUuid(task.projectId)
      },
    ),
    waiting: validateOwnedCollection<Waiting>(
      value.waiting,
      userId,
      validateWaiting,
      (waiting) => {
        requireNullableUuid(waiting.projectId)
        requireNullableUuid(waiting.sourceTaskId)
      },
    ),
    memos: validateOwnedCollection<Memo>(
      value.memos,
      userId,
      validateMemo,
      (memo) => {
        requireNullableUuid(memo.projectId)
      },
    ),
    routines: validateOwnedCollection<Routine>(
      value.routines,
      userId,
      validateRoutine,
    ),
    routineLogs: validateOwnedCollection<RoutineLog>(
      value.routineLogs,
      userId,
      validateRoutineLog,
      (log) => requireUuid(log.routineId),
    ),
    activities: validateOwnedCollection<Activity>(
      value.activities,
      userId,
      validateActivity,
      assertActivityPayload,
    ),
    dailyLogs: validateOwnedCollection<DailyLog>(
      value.dailyLogs,
      userId,
      validateDailyLog,
      assertDailyLogSnapshotIds,
    ),
  }
  assertReferences(data)
  assertEffectiveInvariants(data)
  return data
}

export function validateBackupDocument(
  value: unknown,
  currentUserId: UserId,
): DailyWorkBackup {
  if (!isRecord(value)) invalid('invalid-structure')
  if (value.format !== backupFormat) invalid('invalid-format')
  if (value.formatVersion !== currentBackupFormatVersion) {
    invalid('unsupported-version')
  }
  if (!isUtcInstant(value.exportedAt)) invalid('invalid-structure')
  if (value.appVersion !== null && typeof value.appVersion !== 'string') {
    invalid('invalid-structure')
  }
  if (!isRecord(value.metadata)) invalid('invalid-structure')
  if (
    !Number.isInteger(value.metadata.sourceDatabaseVersion) ||
    (value.metadata.sourceDatabaseVersion as number) < 1 ||
    typeof value.metadata.userId !== 'string'
  ) {
    invalid('invalid-structure')
  }
  if (value.metadata.userId !== currentUserId) invalid('wrong-owner')
  return {
    format: backupFormat,
    formatVersion: currentBackupFormatVersion,
    exportedAt: value.exportedAt,
    appVersion: value.appVersion,
    metadata: {
      sourceDatabaseVersion: value.metadata.sourceDatabaseVersion as number,
      userId: currentUserId,
    },
    data: validateBackupData(value.data, currentUserId),
  }
}

export function parseBackupDocument(
  json: string,
  currentUserId: UserId,
): DailyWorkBackup {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new BackupError('invalid-json', { cause: error })
  }
  return validateBackupDocument(value, currentUserId)
}
