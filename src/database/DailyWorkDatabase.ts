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
import type {
  LocalMutationChange,
  LocalMutationRecord,
  PersistedSyncConflict,
  SyncBootstrapRecord,
  SyncDeviceState,
  SyncMetadata,
  BootstrapProgressRecord,
  OwnershipCheckpointRecord,
} from '@/sync/contracts'

export const dailyWorkDatabaseName = 'daily-work-os'
export const currentDatabaseVersion = 10

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
export const localMutationStoreSchema =
  'mutationId, userId, deviceId, commitOrder, status, occurredAt, *entityKeys, [userId+status], [userId+deviceId+commitOrder], [userId+deviceId+status]'
export const syncDeviceStateStoreSchema =
  'id, userId, deviceId, lastCommitOrder, lastPulledRevision, [userId+deviceId]'
export const syncConflictStoreSchema =
  'id, userId, mutationId, entityType, entityId, status, createdAt, [userId+status], [userId+entityType+entityId], [userId+mutationId]'
export const syncBootstrapStoreSchema = 'userId, state, updatedAt'
export const bootstrapProgressStoreSchema =
  'userId, bootstrapId, sourceUserId, mode, stage, updatedAt'
export const ownershipCheckpointStoreSchema =
  'bootstrapId, sourceUserId, targetUserId, createdAt'

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
const version9Stores = {
  ...version8Stores,
  local_mutations: localMutationStoreSchema,
  sync_device_state: syncDeviceStateStoreSchema,
  sync_conflicts: syncConflictStoreSchema,
  sync_bootstrap: syncBootstrapStoreSchema,
}
const version10Stores = {
  ...version9Stores,
  bootstrap_progress: bootstrapProgressStoreSchema,
  ownership_checkpoints: ownershipCheckpointStoreSchema,
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
  local_mutations!: EntityTable<LocalMutationRecord, 'mutationId'>
  sync_device_state!: EntityTable<SyncDeviceState, 'id'>
  sync_conflicts!: EntityTable<PersistedSyncConflict, 'id'>
  sync_bootstrap!: EntityTable<SyncBootstrapRecord, 'userId'>
  bootstrap_progress!: EntityTable<BootstrapProgressRecord, 'userId'>
  ownership_checkpoints!: EntityTable<OwnershipCheckpointRecord, 'bootstrapId'>
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
    this.version(8).stores(version8Stores)
    this.version(9)
      .stores(version9Stores)
      .upgrade(async (transaction) => {
        const userIds = new Set<string>()
        for (const storeName of [
          'tasks',
          'confirmations',
          'memos',
          'routines',
          'routine_logs',
          'activities',
          'daily_logs',
          'local_changes',
          'sync_metadata',
        ]) {
          const rows = await transaction.table(storeName).toArray()
          rows.forEach((row) => {
            if (typeof row.userId === 'string' && row.userId) {
              userIds.add(row.userId)
            }
          })
        }
        const updatedAt = new Date().toISOString()
        await transaction.table('sync_bootstrap').bulkPut(
          [...userIds].map((userId) => ({
            userId,
            state: 'requires_bootstrap',
            updatedAt,
          })),
        )
        // Version 8 rows contain no immutable snapshots. They cannot be
        // promoted into the formal Version 9 mutation contract.
        await transaction.table('local_changes').clear()
        await transaction.table('sync_metadata').clear()
      })
    this.version(currentDatabaseVersion).stores(version10Stores)

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
