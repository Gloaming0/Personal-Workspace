import {
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import type {
  TaskRepository,
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { DexieWaitingRepository } from '@/repositories/dexie/DexieWaitingRepository'
import { TaskPersistenceError } from '@/repositories/errors'
import { TaskService } from './TaskService'
import { WaitingService } from '@/features/waiting/WaitingService'
import { DexieMemoRepository } from '@/repositories/dexie/DexieMemoRepository'
import { DexieRoutineRepository } from '@/repositories/dexie/DexieRoutineRepository'
import { DexieRoutineLogRepository } from '@/repositories/dexie/DexieRoutineLogRepository'
import { MemoService } from '@/features/memos/MemoService'
import { RoutineService } from '@/features/routines/RoutineService'

export const localUserId = 'local-user'

export interface TaskRuntime {
  repository: TaskRepository
  service: TaskService
  waitingRepository: WaitingRepository
  waitingService: WaitingService
  memoRepository: MemoRepository
  memoService: MemoService
  routineRepository: RoutineRepository
  routineLogRepository: RoutineLogRepository
  routineService: RoutineService
  ready: Promise<void>
}

export function createTaskRuntime(
  database = new DailyWorkDatabase(),
): TaskRuntime {
  const repository = new DexieTaskRepository(database)
  const waitingRepository = new DexieWaitingRepository(database)
  const memoRepository = new DexieMemoRepository(database)
  const routineRepository = new DexieRoutineRepository(database)
  const routineLogRepository = new DexieRoutineLogRepository(database)
  return {
    repository,
    service: new TaskService(repository),
    waitingRepository,
    waitingService: new WaitingService(waitingRepository),
    memoRepository,
    memoService: new MemoService(memoRepository),
    routineRepository,
    routineLogRepository,
    routineService: new RoutineService(routineRepository, routineLogRepository),
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
