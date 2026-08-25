import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from './DailyWorkDatabase'
import { ActivityService } from '@/features/activity/ActivityService'
import { EndDayQuery } from '@/features/endDay/EndDayQuery'
import { EndDayService } from '@/features/endDay/EndDayService'
import { RoutineService } from '@/features/routines/RoutineService'
import { FocusLimitError, TaskService } from '@/features/tasks/TaskService'
import { MockTodayProjectNameResolver } from '@/features/today/MockTodayProjectNameResolver'
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { DexieDailyLogRepository } from '@/repositories/dexie/DexieDailyLogRepository'
import { DexieMemoRepository } from '@/repositories/dexie/DexieMemoRepository'
import { DexieRoutineLogRepository } from '@/repositories/dexie/DexieRoutineLogRepository'
import { DexieRoutineRepository } from '@/repositories/dexie/DexieRoutineRepository'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { DexieWaitingRepository } from '@/repositories/dexie/DexieWaitingRepository'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { DexieUnitOfWork } from '@/unitOfWork/dexie/DexieUnitOfWork'
import { createTask } from '@/domain/task'

let sequence = 0

describe('two-connection invariants', () => {
  let name: string
  let first: DailyWorkDatabase
  let second: DailyWorkDatabase

  beforeEach(async () => {
    name = `multi-connection-${++sequence}`
    first = new DailyWorkDatabase(name)
    second = new DailyWorkDatabase(name)
    await Promise.all([first.open(), second.open()])
  })

  afterEach(async () => {
    first.changes.close()
    second.changes.close()
    first.close()
    second.close()
    await Dexie.delete(name)
  })

  it('serializes concurrent Focus allocation into unique slots capped at three', async () => {
    const firstTasks = new DexieTaskRepository(first)
    const secondTasks = new DexieTaskRepository(second)
    const firstService = new TaskService(
      firstTasks,
      new DexieUnitOfWork(first),
      {
        createId: () => crypto.randomUUID(),
        now: () => '2026-08-25T08:00:00.000Z',
      },
    )
    const secondService = new TaskService(
      secondTasks,
      new DexieUnitOfWork(second),
      { now: () => '2026-08-25T08:01:00.000Z' },
    )
    const tasks = []
    for (const title of ['One', 'Two', 'Three', 'Four']) {
      tasks.push(
        await firstService.create({
          userId: 'user-1',
          title,
          plannedDate: '2026-08-25',
        }),
      )
    }
    await Promise.all([
      firstService.setFocus('user-1', tasks[0]!.id, '2026-08-25'),
      firstService.setFocus('user-1', tasks[1]!.id, '2026-08-25'),
    ])
    const results = await Promise.allSettled([
      firstService.setFocus('user-1', tasks[2]!.id, '2026-08-25'),
      secondService.setFocus('user-1', tasks[3]!.id, '2026-08-25'),
    ])

    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: expect.any(FocusLimitError) })
    const focused = await firstTasks.find('user-1', {
      focusDate: '2026-08-25',
    })
    expect(focused).toHaveLength(3)
    expect(new Set(focused.map((task) => task.focusOrder)).size).toBe(3)
  })

  it('creates one effective RoutineLog and Activity for concurrent completion', async () => {
    const firstRoutines = new DexieRoutineRepository(first)
    const firstLogs = new DexieRoutineLogRepository(first)
    const secondRoutines = new DexieRoutineRepository(second)
    const secondLogs = new DexieRoutineLogRepository(second)
    const firstActivities = new DexieActivityRepository(first)
    const secondActivities = new DexieActivityRepository(second)
    const routine = await new RoutineService(
      firstRoutines,
      firstLogs,
      new DexieUnitOfWork(first),
      {
        createId: () => 'routine-1',
        now: () => '2026-08-25T08:00:00.000Z',
      },
    ).create({
      userId: 'user-1',
      title: 'Daily check',
      schedule: { frequency: 'daily' },
      timezone: 'UTC',
    })
    const firstService = new RoutineService(
      firstRoutines,
      firstLogs,
      new DexieUnitOfWork(first),
      {
        createId: () => 'routine-log-a',
        now: () => '2026-08-25T09:00:00.000Z',
      },
      new ActivityService(firstActivities, {
        createId: () => 'activity-a',
        now: () => '2026-08-25T09:00:00.000Z',
      }),
    )
    const secondService = new RoutineService(
      secondRoutines,
      secondLogs,
      new DexieUnitOfWork(second),
      {
        createId: () => 'routine-log-b',
        now: () => '2026-08-25T09:00:01.000Z',
      },
      new ActivityService(secondActivities, {
        createId: () => 'activity-b',
        now: () => '2026-08-25T09:00:01.000Z',
      }),
    )

    await Promise.all([
      firstService.complete('user-1', routine.id, '2026-08-25'),
      secondService.complete('user-1', routine.id, '2026-08-25'),
    ])

    await expect(
      firstLogs.findForDate('user-1', '2026-08-25'),
    ).resolves.toHaveLength(1)
    await expect(firstActivities.find('user-1', {})).resolves.toHaveLength(1)
  })

  it('finalizes one DailyLog and Activity for concurrent End Day commands', async () => {
    const createService = (database: DailyWorkDatabase, suffix: string) => {
      const tasks = new DexieTaskRepository(database)
      const waiting = new DexieWaitingRepository(database)
      const memos = new DexieMemoRepository(database)
      const routines = new DexieRoutineRepository(database)
      const routineLogs = new DexieRoutineLogRepository(database)
      const activities = new DexieActivityRepository(database)
      const logs = new DexieDailyLogRepository(database)
      const unitOfWork = new DexieUnitOfWork(database)
      const taskService = new TaskService(tasks, unitOfWork, {
        now: () => `2026-08-25T10:00:0${suffix}.000Z`,
      })
      return {
        tasks,
        logs,
        activities,
        taskService,
        service: new EndDayService(
          new EndDayQuery({
            tasks,
            waiting,
            memos,
            routines,
            routineLogs,
            projectNames: new MockTodayProjectNameResolver(),
          }),
          taskService,
          logs,
          unitOfWork,
          new ActivityService(activities, {
            createId: () => `daily-activity-${suffix}`,
            now: () => `2026-08-25T10:00:0${suffix}.000Z`,
          }),
          { now: () => `2026-08-25T10:00:0${suffix}.000Z` },
        ),
      }
    }
    const firstContext = createService(first, '1')
    const secondContext = createService(second, '2')
    const task = createTask(
      { userId: 'user-1', title: 'Keep me', plannedDate: '2026-08-25' },
      { id: 'end-day-task', now: '2026-08-25T08:00:00.000Z' },
    )
    await firstContext.tasks.save('user-1', task)
    const input = {
      userId: 'user-1',
      date: '2026-08-25',
      timezone: 'UTC',
      summary: '',
      taskActions: { [task.id]: 'keep' as const },
    }
    const results = await Promise.allSettled([
      firstContext.service.finalize({ ...input, commandId: 'daily-log-a' }),
      secondContext.service.finalize({ ...input, commandId: 'daily-log-b' }),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    await expect(first.daily_logs.count()).resolves.toBe(1)
    await expect(
      firstContext.activities.find('user-1', {}),
    ).resolves.toHaveLength(1)
  })

  it('allows only one concurrent update from the same expectedVersion', async () => {
    const firstTasks = new DexieTaskRepository(first)
    const secondTasks = new DexieTaskRepository(second)
    const task = createTask(
      { userId: 'user-1', title: 'Version one', plannedDate: '2026-08-25' },
      { id: 'versioned-task', now: '2026-08-25T08:00:00.000Z' },
    )
    await firstTasks.save('user-1', task)
    const updates = ['First update', 'Second update'].map((title, index) => ({
      ...task,
      title,
      updatedAt: `2026-08-25T09:00:0${index}.000Z`,
      version: 2,
    }))

    const results = await Promise.allSettled([
      firstTasks.save('user-1', updates[0]!, { expectedVersion: 1 }),
      secondTasks.save('user-1', updates[1]!, { expectedVersion: 1 }),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: expect.any(RepositoryVersionConflictError) })
    await expect(firstTasks.getById('user-1', task.id)).resolves.toMatchObject({
      version: 2,
    })
  })
})
