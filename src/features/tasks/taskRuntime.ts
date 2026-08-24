import {
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import type { TaskRepository } from '@/repositories/contracts'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { TaskPersistenceError } from '@/repositories/errors'
import { TaskService } from './TaskService'

export const localUserId = 'local-user'

export interface TaskRuntime {
  repository: TaskRepository
  service: TaskService
  ready: Promise<void>
}

export function createTaskRuntime(
  database = new DailyWorkDatabase(),
): TaskRuntime {
  const repository = new DexieTaskRepository(database)
  return {
    repository,
    service: new TaskService(repository),
    ready: initializeLocalDatabase(database).catch((error: unknown) => {
      throw new TaskPersistenceError('Task storage could not be initialized.', {
        cause: error,
      })
    }),
  }
}

let defaultTaskRuntime: TaskRuntime | undefined

export function getTaskRuntime(): TaskRuntime {
  defaultTaskRuntime ??= createTaskRuntime()
  return defaultTaskRuntime
}
