import { describe, expect, it } from 'vitest'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { InMemoryMemoRepository } from '@/repositories/inMemory/InMemoryMemoRepository'
import { InMemoryRoutineRepository } from '@/repositories/inMemory/InMemoryRoutineRepository'
import { InMemoryRoutineLogRepository } from '@/repositories/inMemory/InMemoryRoutineLogRepository'
import { InMemoryActivityRepository } from '@/repositories/inMemory/InMemoryActivityRepository'
import { TaskService } from '@/features/tasks/TaskService'
import { MemoService } from '@/features/memos/MemoService'
import { RoutineService } from '@/features/routines/RoutineService'
import { ActivityService } from '@/features/activity/ActivityService'
import { WaitingService } from '@/features/waiting/WaitingService'
import { DefaultTodayDashboardQuery } from './TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from './TodayDashboardViewModelAssembler'
import { MockTodayProjectNameResolver } from './MockTodayProjectNameResolver'
import { InMemoryUnitOfWork } from '@/unitOfWork/inMemory/InMemoryUnitOfWork'

describe('TodayDashboardQuery aggregation', () => {
  it('uses each Routine timezone instead of the user or device timezone', async () => {
    const routines = new InMemoryRoutineRepository()
    const routineLogs = new InMemoryRoutineLogRepository()
    const service = new RoutineService(
      routines,
      routineLogs,
      new InMemoryUnitOfWork({ routines, routineLogs }),
      {
        createId: () => 'kiritimati-routine',
        now: () => '2026-08-24T10:30:00.000Z',
      },
    )
    await service.create({
      userId: 'user-1',
      title: 'Kiritimati Tuesday',
      schedule: { frequency: 'weekly', daysOfWeek: [2] },
      timezone: 'Pacific/Kiritimati',
    })
    const query = new DefaultTodayDashboardQuery({
      tasks: new InMemoryTaskRepository(),
      waiting: new InMemoryWaitingRepository(),
      memos: new InMemoryMemoRepository(),
      routines,
      routineLogs,
      activities: new InMemoryActivityRepository(),
      projectNames: new MockTodayProjectNameResolver(),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })

    const result = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'America/Los_Angeles',
      instant: '2026-08-24T10:30:00.000Z',
      language: 'en',
    })
    expect(result.checkIns).toEqual([
      expect.objectContaining({
        title: 'Kiritimati Tuesday',
        date: '2026-08-25',
      }),
    ])
  })

  it('isolates every aggregate source by the requested user', async () => {
    const tasks = new InMemoryTaskRepository()
    const waiting = new InMemoryWaitingRepository()
    const memos = new InMemoryMemoRepository()
    const routines = new InMemoryRoutineRepository()
    const routineLogs = new InMemoryRoutineLogRepository()
    const activities = new InMemoryActivityRepository()
    let id = 0
    const now = () => '2026-08-24T09:00:00.000Z'
    const taskService = new TaskService(
      tasks,
      new InMemoryUnitOfWork({ tasks }),
      {
        createId: () => `task-isolation-${++id}`,
        now,
      },
    )
    const waitingService = new WaitingService(
      waiting,
      new InMemoryUnitOfWork({ waiting }),
      {
        createId: () => `waiting-isolation-${++id}`,
        now,
      },
    )
    const memoService = new MemoService(
      memos,
      new InMemoryUnitOfWork({ memos }),
      {
        createId: () => `memo-isolation-${++id}`,
        now,
      },
    )
    const routineService = new RoutineService(
      routines,
      routineLogs,
      new InMemoryUnitOfWork({ routines, routineLogs }),
      {
        createId: () => `routine-isolation-${++id}`,
        now,
      },
    )
    const activityService = new ActivityService(activities, {
      createId: () => `activity-isolation-${++id}`,
      now,
    })
    for (const userId of ['user-1', 'user-2']) {
      await taskService.create({
        userId,
        title: `${userId} task`,
        plannedDate: '2026-08-24',
      })
      await waitingService.create({ userId, title: `${userId} waiting` })
      await memoService.create({
        userId,
        content: `${userId} memo`,
        pinned: true,
      })
      await routineService.create({
        userId,
        title: `${userId} routine`,
        schedule: { frequency: 'daily' },
        timezone: 'UTC',
      })
      await activityService.record({
        userId,
        eventType: 'task_created',
        entityType: 'task',
        entityId: `activity-task-${userId}`,
        title: `${userId} activity`,
      })
    }

    const query = new DefaultTodayDashboardQuery({
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      projectNames: new MockTodayProjectNameResolver(),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'UTC',
      language: 'en',
    })

    expect(result.tasks.map((item) => item.title)).toEqual(['user-1 task'])
    expect(result.waiting.map((item) => item.title)).toEqual(['user-1 waiting'])
    expect(result.quickMemo?.content).toBe('user-1 memo')
    expect(result.checkIns.map((item) => item.title)).toEqual([
      'user-1 routine',
    ])
    expect(result.recentActivity.map((item) => item.text)).toEqual([
      'Created “user-1 activity”',
    ])
  })

  it('projects repository data without a supporting Mock dependency', async () => {
    const repository = new InMemoryTaskRepository()
    let id = 0
    const service = new TaskService(
      repository,
      new InMemoryUnitOfWork({ tasks: repository }),
      {
        createId: () => `task-${++id}`,
        now: () => '2026-08-24T09:00:00.000Z',
      },
    )
    const first = await service.create({
      userId: 'user-1',
      title: 'User-authored task',
      plannedDate: '2026-08-24',
      priority: 'P1',
    })
    await service.setFocus('user-1', first.id, '2026-08-24')
    const completed = await service.create({
      userId: 'user-1',
      title: 'Completed task',
      plannedDate: '2026-08-24',
    })
    await service.complete('user-1', completed.id)
    await service.create({
      userId: 'user-1',
      title: 'Tomorrow task',
      plannedDate: '2026-08-25',
    })

    const query = new DefaultTodayDashboardQuery({
      tasks: repository,
      waiting: new InMemoryWaitingRepository(),
      memos: new InMemoryMemoRepository(),
      routines: new InMemoryRoutineRepository(),
      routineLogs: new InMemoryRoutineLogRepository(),
      activities: new InMemoryActivityRepository(),
      projectNames: new MockTodayProjectNameResolver(),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
    })

    expect(result.tasks.map((task) => task.title)).toEqual([
      'User-authored task',
      'Completed task',
    ])
    expect(result.focus).toHaveLength(1)
    expect(result.focus[0]?.taskId).toBe(first.id)
    expect(result.summary.openTaskCount).toBe(1)
    expect(result.waiting).toHaveLength(0)
    expect(result.checkIns).toHaveLength(0)
    expect(result.quickMemo).toBeNull()
    expect(result.recentActivity).toHaveLength(0)
  })

  it('selects pinned Memo first and left-joins scheduled Routine logs', async () => {
    const memos = new InMemoryMemoRepository()
    let memoId = 0
    let memoTick = 0
    const memoService = new MemoService(
      memos,
      new InMemoryUnitOfWork({ memos }),
      {
        createId: () => `memo-${++memoId}`,
        now: () =>
          [
            '2026-08-24T08:00:00.000Z',
            '2026-08-24T10:00:00.000Z',
            '2026-08-24T11:00:00.000Z',
            '2026-08-24T12:00:00.000Z',
          ][memoTick++] ?? '2026-08-24T11:00:00.000Z',
      },
    )
    const pinned = await memoService.create({
      userId: 'user-1',
      content: 'Older pinned memo',
      pinned: true,
      projectId: 'project-1',
    })
    await memoService.create({
      userId: 'user-1',
      content: 'Newer unpinned memo',
    })

    const routines = new InMemoryRoutineRepository()
    const routineLogs = new InMemoryRoutineLogRepository()
    let routineId = 0
    const routineService = new RoutineService(
      routines,
      routineLogs,
      new InMemoryUnitOfWork({ routines, routineLogs }),
      {
        createId: () => `routine-entity-${++routineId}`,
        now: () => '2026-08-24T09:00:00.000Z',
      },
    )
    const daily = await routineService.create({
      userId: 'user-1',
      title: 'Daily check',
      schedule: { frequency: 'daily' },
      timezone: 'Asia/Shanghai',
    })
    await routineService.create({
      userId: 'user-1',
      title: 'Monday check',
      schedule: { frequency: 'weekly', daysOfWeek: [1] },
      timezone: 'Asia/Shanghai',
    })
    await routineService.create({
      userId: 'user-1',
      title: 'Tuesday only',
      schedule: { frequency: 'weekly', daysOfWeek: [2] },
      timezone: 'Asia/Shanghai',
    })
    const paused = await routineService.create({
      userId: 'user-1',
      title: 'Paused daily',
      schedule: { frequency: 'daily' },
      timezone: 'Asia/Shanghai',
    })
    await routineService.pause('user-1', paused.id)
    await routineService.complete('user-1', daily.id, '2026-08-24')

    const query = new DefaultTodayDashboardQuery({
      tasks: new InMemoryTaskRepository(),
      waiting: new InMemoryWaitingRepository(),
      memos,
      routines,
      routineLogs,
      activities: new InMemoryActivityRepository(),
      projectNames: new MockTodayProjectNameResolver(
        new Map([['project-1', 'Project One']]),
      ),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
      language: 'en',
      instant: '2026-08-24T04:00:00.000Z',
    })

    expect(result.quickMemo).toMatchObject({
      memoId: pinned.id,
      content: 'Older pinned memo',
      pinned: true,
      projectName: 'Project One',
    })
    expect(result.checkIns.map((item) => item.title)).toEqual([
      'Daily check',
      'Monday check',
    ])
    expect(result.checkIns[0]).toMatchObject({ completed: true })
    expect(result.summary).toMatchObject({
      completedCheckInCount: 1,
      totalCheckInCount: 2,
    })

    await memoService.unpin('user-1', pinned.id)
    const newest = await memoService.create({
      userId: 'user-1',
      content: 'Newest today memo',
    })
    const fallbackResult = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
      language: 'en',
    })
    expect(fallbackResult.quickMemo?.memoId).toBe(newest.id)
  })

  it('assembles raw Activity payload in the requested UI language', async () => {
    const activities = new InMemoryActivityRepository()
    await new ActivityService(activities, {
      createId: () => 'activity-bilingual',
      now: () => '2026-08-24T12:00:00.000Z',
    }).record({
      userId: 'user-1',
      eventType: 'task_completed',
      entityType: 'task',
      entityId: 'task-bilingual',
      title: '用户原始 Title',
    })
    const query = new DefaultTodayDashboardQuery({
      tasks: new InMemoryTaskRepository(),
      waiting: new InMemoryWaitingRepository(),
      memos: new InMemoryMemoRepository(),
      routines: new InMemoryRoutineRepository(),
      routineLogs: new InMemoryRoutineLogRepository(),
      activities,
      projectNames: new MockTodayProjectNameResolver(),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })

    const english = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
      language: 'en',
    })
    const chinese = await query.execute({
      userId: 'user-1',
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
    })

    expect(english.recentActivity[0]?.text).toBe('Completed “用户原始 Title”')
    expect(chinese.recentActivity[0]?.text).toBe('完成「用户原始 Title」')
    await expect(activities.find('user-1', {})).resolves.toMatchObject([
      {
        payload: { title: '用户原始 Title', entityId: 'task-bilingual' },
      },
    ])
  })
})
