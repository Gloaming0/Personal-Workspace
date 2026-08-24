import Dexie, { type EntityTable } from 'dexie'
import type { Task } from '@/domain/entities'

export const dailyWorkDatabaseName = 'daily-work-os'
export const currentDatabaseVersion = 1

const version1Stores = {
  tasks:
    'id, userId, status, priority, plannedDate, dueAt, projectId, focusDate, completedAt, deletedAt, updatedAt, [userId+plannedDate], [userId+focusDate], [userId+status]',
}

export class DailyWorkDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>

  constructor(name = dailyWorkDatabaseName) {
    super(name)

    // Future migrations append a higher version; existing versions stay intact.
    this.version(currentDatabaseVersion).stores(version1Stores)
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
