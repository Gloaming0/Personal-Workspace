import { describe, expect, it } from 'vitest'
import { TaskService } from '@/features/tasks/TaskService'
import { WaitingService } from '@/features/waiting/WaitingService'
import { MemoService } from '@/features/memos/MemoService'
import { RoutineService } from '@/features/routines/RoutineService'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { InMemoryMemoRepository } from '@/repositories/inMemory/InMemoryMemoRepository'
import { InMemoryRoutineRepository } from '@/repositories/inMemory/InMemoryRoutineRepository'
import { InMemoryRoutineLogRepository } from '@/repositories/inMemory/InMemoryRoutineLogRepository'
import { InMemoryActivityRepository } from '@/repositories/inMemory/InMemoryActivityRepository'
import { ActivityAppendConflictError } from '@/repositories/errors'
import { ActivityService } from './ActivityService'
import { InMemoryUnitOfWork } from '@/unitOfWork/inMemory/InMemoryUnitOfWork'

describe('Activity-producing Service operations', () => {
  it('records the required raw events without localized presentation text', async () => {
    const activities = new InMemoryActivityRepository()
    let activityId = 0
    let activityTick = 0
    const activityService = new ActivityService(activities, {
      createId: () => `activity-${++activityId}`,
      now: () =>
        `2026-08-24T12:00:${String(activityTick++).padStart(2, '0')}.000Z`,
    })

    const taskRepository = new InMemoryTaskRepository()
    const tasks = new TaskService(
      taskRepository,
      new InMemoryUnitOfWork({
        tasks: taskRepository,
        activities,
      }),
      {
        createId: () => 'task-activity',
        now: () => '2026-08-24T09:00:00.000Z',
      },
      activityService,
    )
    const task = await tasks.create({
      userId: 'user-1',
      title: '用户 Task title',
      plannedDate: '2026-08-24',
      projectId: 'project-1',
    })
    await tasks.setFocus('user-1', task.id, '2026-08-24')
    await tasks.removeFocus('user-1', task.id)
    await tasks.complete('user-1', task.id)
    await tasks.reopen('user-1', task.id)

    const waitingRepository = new InMemoryWaitingRepository()
    const waiting = new WaitingService(
      waitingRepository,
      new InMemoryUnitOfWork({
        waiting: waitingRepository,
        activities,
      }),
      {
        createId: () => 'waiting-activity',
        now: () => '2026-08-24T09:10:00.000Z',
      },
      activityService,
    )
    const waitingEntity = await waiting.create({
      userId: 'user-1',
      title: '等待 Approval',
    })
    await waiting.setFollowUpDate('user-1', waitingEntity.id, '2026-08-25')
    await waiting.confirm('user-1', waitingEntity.id)
    await waiting.close('user-1', waitingEntity.id)
    await waiting.reopen('user-1', waitingEntity.id)

    const memoRepository = new InMemoryMemoRepository()
    const memos = new MemoService(
      memoRepository,
      new InMemoryUnitOfWork({
        memos: memoRepository,
        activities,
      }),
      {
        createId: () => 'memo-activity',
        now: () => '2026-08-24T09:20:00.000Z',
      },
      activityService,
    )
    const memo = await memos.create({
      userId: 'user-1',
      content: '原始 Memo text',
    })
    await memos.edit('user-1', memo.id, { content: '编辑后的 Memo text' })
    await memos.pin('user-1', memo.id)
    await memos.unpin('user-1', memo.id)

    const routineRepository = new InMemoryRoutineRepository()
    const routineLogs = new InMemoryRoutineLogRepository()
    let routineEntityId = 0
    const routines = new RoutineService(
      routineRepository,
      routineLogs,
      new InMemoryUnitOfWork({
        routines: routineRepository,
        routineLogs,
        activities,
      }),
      {
        createId: () => `routine-entity-${++routineEntityId}`,
        now: () => '2026-08-24T09:30:00.000Z',
      },
      activityService,
    )
    const routine = await routines.create({
      userId: 'user-1',
      title: 'Daily 原始检查',
      schedule: { frequency: 'daily' },
      timezone: 'Asia/Shanghai',
    })
    await routines.complete('user-1', routine.id, '2026-08-24')
    await routines.undo('user-1', routine.id, '2026-08-24')

    const recorded = await activities.find('user-1', { limit: 20 })
    expect(recorded.map((activity) => activity.eventType).reverse()).toEqual([
      'task_created',
      'task_focus_set',
      'task_focus_removed',
      'task_completed',
      'task_reopened',
      'waiting_created',
      'waiting_followup_changed',
      'waiting_confirmed',
      'waiting_closed',
      'waiting_reopened',
      'memo_created',
      'memo_updated',
      'memo_pinned',
      'memo_unpinned',
      'routine_completed',
      'routine_completion_undone',
    ])
    for (const activity of recorded) {
      expect(activity.payload).toMatchObject({ entityId: activity.entityId })
      expect(Object.keys(activity.payload)).not.toEqual(
        expect.arrayContaining([
          'message',
          'description',
          'language',
          'en',
          'zh-CN',
        ]),
      )
      expect(JSON.stringify(activity.payload)).not.toContain('Created “')
      expect(activity.version).toBe(1)
      expect(activity.deletedAt).toBeNull()
    }
    expect(
      recorded.find((activity) => activity.eventType === 'task_created')
        ?.payload,
    ).toMatchObject({ title: '用户 Task title', projectId: 'project-1' })
  })

  it('is append-only and sorts newest events first', async () => {
    const repository = new InMemoryActivityRepository()
    const firstService = new ActivityService(repository, {
      createId: () => 'same-activity',
      now: () => '2026-08-24T08:00:00.000Z',
    })
    const activity = await firstService.record({
      userId: 'user-1',
      eventType: 'task_created',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Raw title',
    })
    await expect(repository.append('user-1', activity)).rejects.toBeInstanceOf(
      ActivityAppendConflictError,
    )

    await new ActivityService(repository, {
      createId: () => 'newer-activity',
      now: () => '2026-08-24T09:00:00.000Z',
    }).record({
      userId: 'user-1',
      eventType: 'task_completed',
      entityType: 'task',
      entityId: 'task-1',
      title: 'Raw title',
    })
    expect((await repository.find('user-1', { limit: 1 }))[0]?.id).toBe(
      'newer-activity',
    )
  })
})
