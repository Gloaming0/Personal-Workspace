import Dexie, { type EntityTable } from 'dexie'
import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import { DatabaseRuntimeState } from './runtimeState'
import { LocalChangeCoordinator } from './LocalChangeCoordinator'
import { checkDatabaseIntegrity } from './checkDatabaseIntegrity'
import type { LocalMutationChange, SyncMetadata } from '@/sync/contracts'

export const dailyWorkDatabaseName = 'daily-work-os'
export const currentDatabaseVersion = 8

export const taskStoreSchema =
  'id, userId, status, priority, plannedDate, dueAt, projectId, focusDate, completedAt, deletedAt, updatedAt, [userId+plannedDate], [userId+focusDate], [userId+status]'
export const confirmationStoreSchema =
  'id, userId, status, person, projectId, sourceTaskId, sentAt, followUpDate, confirmedAt, closedAt, deletedAt, updatedAt, [userId+status], [userId+followUpDate], [userId+projectId]'
export const memoStoreSchema =
  'id, userId, pinned, projectId, updatedAt, deletedAt, [userId+pinned], [userId+updatedAt], [userId+projectId]'
export const routineStoreSchema =
  'id, userId, status, timezone, sortOrder, deletedAt, updatedAt, [userId+status]'
export const routineLogStoreSchema =
  'id, userId, routineId, date, completedAt, deletedAt, updatedAt, [routineId+date], [userId+routineId+date], [userId+date]'
export const activityStoreSchema =
  'id, userId, eventType, entityType, entityId, occurredAt, deviceId, [userId+occurredAt], [entityType+entityId], [userId+eventType]'
export const dailyLogStoreSchema =
  'id, userId, date, finalizedAt, deletedAt, [userId+date], [userId+finalizedAt]'
export const localChangeStoreSchema =
  'id, mutationId, userId, entityType, entityId, operation, status, occurredAt, [userId+status], [userId+mutationId], [userId+entityType], [entityType+entityId]'
export const syncMetadataStoreSchema =
  'id, userId, entityType, entityId, localVersion, serverRevision, lastMutationId, [userId+entityType+entityId], [userId+lastMutationId]'

const version1Stores = {
  tasks: taskStoreSchema,
}

const version2Stores = {
  ...version1Stores,
  confirmations: confirmationStoreSchema,
}

const version3Stores = {
  ...version2Stores,
  memos: memoStoreSchema,
}

const version4Stores = {
  ...version3Stores,
  routines: routineStoreSchema,
  routine_logs: routineLogStoreSchema,
}

const version5Stores = {
  ...version4Stores,
  activities: activityStoreSchema,
}

const version6Stores = {
  ...version5Stores,
  daily_logs: dailyLogStoreSchema,
}

const version7Stores = version6Stores
const version8Stores = {
  ...version7Stores,
  local_changes: localChangeStoreSchema,
  sync_metadata: syncMetadataStoreSchema,
}

export class DailyWorkDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>
  memos!: EntityTable<Memo, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_logs!: EntityTable<RoutineLog, 'id'>
  activities!: EntityTable<Activity, 'id'>
  daily_logs!: EntityTable<DailyLog, 'id'>
  local_changes!: EntityTable<LocalMutationChange, 'id'>
  sync_metadata!: EntityTable<SyncMetadata, 'id'>
  readonly runtime = new DatabaseRuntimeState(currentDatabaseVersion)
  readonly changes: LocalChangeCoordinator

  constructor(name = dailyWorkDatabaseName) {
    super(name)
    this.changes = new LocalChangeCoordinator(name)

    this.version(1).stores(version1Stores)
    this.version(2).stores(version2Stores)
    this.version(3).stores(version3Stores)
    this.version(4).stores(version4Stores)
    this.version(5).stores(version5Stores)
    this.version(6).stores(version6Stores)
    this.version(7)
      .stores(version7Stores)
      .upgrade(async (transaction) => {
        await transaction
          .table<DailyLog>('daily_logs')
          .toCollection()
          .modify((log) => {
            if (!log.finalizeTimezone) log.finalizeTimezone = 'UTC'
          })
      })
    this.version(currentDatabaseVersion).stores(version8Stores)

    this.on('blocked', () => this.runtime.blocked())
    this.on('versionchange', () => {
      this.close()
      this.runtime.versionChanged()
    })
  }
}

export class LocalDatabaseInitializationError extends Error {
  constructor(cause: unknown) {
    super('The local database could not be initialized.', { cause })
    this.name = 'LocalDatabaseInitializationError'
  }
}

export async function initializeLocalDatabase(
  database: DailyWorkDatabase,
): Promise<void> {
  database.runtime.opening()
  try {
    await database.open()
    if (await checkDatabaseIntegrity(database)) database.runtime.ready()
  } catch (error) {
    database.runtime.failure(error, { phase: 'open' })
    throw new LocalDatabaseInitializationError(error)
  }
}
