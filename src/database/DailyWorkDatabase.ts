import Dexie, { type EntityTable } from 'dexie'
import type { Task, Waiting } from '@/domain/entities'

export const dailyWorkDatabaseName = 'daily-work-os'
export const currentDatabaseVersion = 2

export const taskStoreSchema =
  'id, userId, status, priority, plannedDate, dueAt, projectId, focusDate, completedAt, deletedAt, updatedAt, [userId+plannedDate], [userId+focusDate], [userId+status]'
export const confirmationStoreSchema =
  'id, userId, status, person, projectId, sourceTaskId, sentAt, followUpDate, confirmedAt, closedAt, deletedAt, updatedAt, [userId+status], [userId+followUpDate], [userId+projectId]'

const version1Stores = {
  tasks: taskStoreSchema,
}

const version2Stores = {
  ...version1Stores,
  confirmations: confirmationStoreSchema,
}

export class DailyWorkDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>

  constructor(name = dailyWorkDatabaseName) {
    super(name)

    this.version(1).stores(version1Stores)
    this.version(currentDatabaseVersion).stores(version2Stores)
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
