import {
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import type {
  ActivityRepository,
  TaskRepository,
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  WaitingRepository,
  DailyLogRepository,
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
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { ActivityService } from '@/features/activity/ActivityService'
import { DexieDailyLogRepository } from '@/repositories/dexie/DexieDailyLogRepository'
import { EndDayQuery } from '@/features/endDay/EndDayQuery'
import { EndDayService } from '@/features/endDay/EndDayService'
import { MockTodayProjectNameResolver } from '@/features/today/MockTodayProjectNameResolver'
import { MorningReviewQuery } from '@/features/morningReview/MorningReviewQuery'
import { MorningReviewService } from '@/features/morningReview/MorningReviewService'
import { LocalMorningReviewSeenStore } from '@/features/morningReview/LocalMorningReviewSeenStore'

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
  activityRepository: ActivityRepository
  activityService: ActivityService
  dailyLogRepository?: DailyLogRepository
  endDayService?: EndDayService
  morningReviewService?: MorningReviewService
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
  const activityRepository = new DexieActivityRepository(database)
  const activityService = new ActivityService(activityRepository)
  const dailyLogRepository = new DexieDailyLogRepository(database)
  const endDayQuery = new EndDayQuery({
    tasks: repository,
    waiting: waitingRepository,
    memos: memoRepository,
    routines: routineRepository,
    routineLogs: routineLogRepository,
    projectNames: new MockTodayProjectNameResolver(),
  })
  const taskService = new TaskService(repository, {}, activityService)
  const morningReviewService = new MorningReviewService(
    new MorningReviewQuery(repository),
    taskService,
    new LocalMorningReviewSeenStore(),
  )
  return {
    repository,
    service: taskService,
    waitingRepository,
    waitingService: new WaitingService(waitingRepository, {}, activityService),
    memoRepository,
    memoService: new MemoService(memoRepository, undefined, activityService),
    routineRepository,
    routineLogRepository,
    routineService: new RoutineService(
      routineRepository,
      routineLogRepository,
      undefined,
      activityService,
    ),
    activityRepository,
    activityService,
    dailyLogRepository,
    endDayService: new EndDayService(
      endDayQuery,
      taskService,
      dailyLogRepository,
      activityService,
    ),
    morningReviewService,
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
