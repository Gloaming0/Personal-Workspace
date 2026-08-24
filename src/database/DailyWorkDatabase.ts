import Dexie, { type EntityTable } from 'dexie'
import type {
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'

export const dailyWorkDatabaseName = 'daily-work-os'
export const currentDatabaseVersion = 4

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

export class DailyWorkDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>
  memos!: EntityTable<Memo, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_logs!: EntityTable<RoutineLog, 'id'>

  constructor(name = dailyWorkDatabaseName) {
    super(name)

    this.version(1).stores(version1Stores)
    this.version(2).stores(version2Stores)
    this.version(3).stores(version3Stores)
    this.version(currentDatabaseVersion).stores(version4Stores)
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
  try {
    await database.open()
  } catch (error) {
    throw new LocalDatabaseInitializationError(error)
  }
}
