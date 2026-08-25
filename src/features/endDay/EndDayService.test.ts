import { describe, expect, it } from 'vitest'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createRoutineLog } from '@/domain/routineLog'
import { createWaiting } from '@/domain/waiting'
import { ActivityService } from '@/features/activity/ActivityService'
import { TaskService } from '@/features/tasks/TaskService'
import { MockTodayProjectNameResolver } from '@/features/today/MockTodayProjectNameResolver'
import { InMemoryActivityRepository } from '@/repositories/inMemory/InMemoryActivityRepository'
import { InMemoryDailyLogRepository } from '@/repositories/inMemory/InMemoryDailyLogRepository'
import { InMemoryMemoRepository } from '@/repositories/inMemory/InMemoryMemoRepository'
import { InMemoryRoutineLogRepository } from '@/repositories/inMemory/InMemoryRoutineLogRepository'
import { InMemoryRoutineRepository } from '@/repositories/inMemory/InMemoryRoutineRepository'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { DailyLogAlreadyFinalizedError } from '@/repositories/errors'
import { EndDayQuery } from './EndDayQuery'
import { EndDayService } from './EndDayService'

const userId = 'user-1'
const date = '2026-08-25'
const now = '2026-08-25T12:00:00.000Z'

function setup() {
  const tasks = new InMemoryTaskRepository()
  const waiting = new InMemoryWaitingRepository()
  const memos = new InMemoryMemoRepository()
  const routines = new InMemoryRoutineRepository()
  const routineLogs = new InMemoryRoutineLogRepository()
  const activities = new InMemoryActivityRepository()
  const logs = new InMemoryDailyLogRepository()
  let taskId = 0
  const taskService = new TaskService(tasks, {
    createId: () => `task-${++taskId}`,
    now: () => now,
  })
  const query = new EndDayQuery({
    tasks,
    waiting,
    memos,
    routines,
    routineLogs,
    projectNames: new MockTodayProjectNameResolver(),
  })
  const service = new EndDayService(
    query,
    taskService,
    logs,
    new ActivityService(activities, {
      createId: () => 'activity-1',
      now: () => now,
    }),
    { createId: () => 'log-1', now: () => now },
  )
  return {
    tasks,
    taskService,
    waiting,
    memos,
    routines,
    routineLogs,
    activities,
    logs,
    service,
    query,
  }
}

describe('End Day service', () => {
  it('applies Tomorrow/Later/Keep/Delete then stores an immutable snapshot and Activity', async () => {
    const context = setup()
    const completed = await context.taskService.create({
      userId,
      title: '完成中文任务',
      plannedDate: date,
    })
    await context.taskService.complete(userId, completed.id)
    const tomorrow = await context.taskService.create({
      userId,
      title: 'Tomorrow task',
      plannedDate: date,
    })
    const later = await context.taskService.create({
      userId,
      title: 'Later task',
      plannedDate: date,
    })
    const keep = await context.taskService.create({
      userId,
      title: 'Keep task',
      plannedDate: date,
    })
    const deleted = await context.taskService.create({
      userId,
      title: 'Delete task',
      plannedDate: date,
    })
    const waiting = createWaiting(
      { userId, title: 'Client approval', person: 'Alex', followUpDate: date },
      { id: 'waiting-1', now },
    )
    await context.waiting.save(userId, waiting)
    await context.memos.save(
      userId,
      createMemo({ userId, content: '保留原始便笺' }, { id: 'memo-1', now }),
    )
    const routine = createRoutine(
      {
        userId,
        title: 'Stretch',
        schedule: { frequency: 'daily' },
        timezone: 'Asia/Shanghai',
      },
      { id: 'routine-1', now },
    )
    await context.routines.save(userId, routine)
    await context.routineLogs.save(
      userId,
      createRoutineLog(
        { userId, routineId: routine.id, date },
        { id: 'routine-log-1', now },
      ),
    )
    await context.taskService.create({
      userId: 'user-2',
      title: 'Other user task',
      plannedDate: date,
    })
    await context.waiting.save(
      'user-2',
      createWaiting(
        { userId: 'user-2', title: 'Other user waiting' },
        { id: 'waiting-user-2', now },
      ),
    )
    await context.memos.save(
      'user-2',
      createMemo(
        { userId: 'user-2', content: 'Other user memo' },
        { id: 'memo-user-2', now },
      ),
    )
    await context.routines.save(
      'user-2',
      createRoutine(
        {
          userId: 'user-2',
          title: 'Other user routine',
          schedule: { frequency: 'daily' },
          timezone: 'UTC',
        },
        { id: 'routine-user-2', now },
      ),
    )

    const log = await context.service.finalize({
      userId,
      date,
      timezone: 'Asia/Shanghai',
      summary: '  今天进展顺利  ',
      taskActions: {
        [tomorrow.id]: 'tomorrow',
        [later.id]: 'later',
        [keep.id]: 'keep',
        [deleted.id]: 'delete',
      },
    })

    expect(log.summary).toBe('今天进展顺利')
    expect(log.snapshot.completedTasks[0]?.title).toBe('完成中文任务')
    expect(log.snapshot.openTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: tomorrow.id,
          plannedDate: '2026-08-26',
        }),
        expect.objectContaining({ entityId: later.id, status: 'later' }),
        expect.objectContaining({ entityId: keep.id, status: 'todo' }),
      ]),
    )
    expect(
      log.snapshot.openTasks.some((task) => task.entityId === deleted.id),
    ).toBe(false)
    await expect(context.tasks.getById(userId, deleted.id)).resolves.toBeNull()
    expect(log.snapshot.routines[0]).toMatchObject({
      completed: true,
      completedAt: now,
    })
    expect(JSON.stringify(log.snapshot)).not.toContain('Other user')

    const changedWaiting = {
      ...waiting,
      title: 'Changed later',
      deletedAt: now,
      updatedAt: now,
      version: 2,
    }
    await context.waiting.save(userId, changedWaiting, { expectedVersion: 1 })
    const completedEntity = (await context.tasks.getById(userId, completed.id))!
    await context.tasks.save(
      userId,
      {
        ...completedEntity,
        title: 'Renamed after finalization',
        updatedAt: '2026-08-26T08:00:00.000Z',
        version: completedEntity.version + 1,
      },
      { expectedVersion: completedEntity.version },
    )
    const stored = await context.logs.findByDate(userId, date)
    expect(stored?.snapshot.waiting[0]?.title).toBe('Client approval')
    expect(stored?.snapshot.completedTasks[0]?.title).toBe('完成中文任务')
    expect(stored?.snapshot.memos[0]?.content).toBe('保留原始便笺')
    expect((await context.activities.find(userId, {}))[0]).toMatchObject({
      eventType: 'daily_log_finalized',
    })

    await expect(
      context.service.finalize({
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: {},
      }),
    ).rejects.toBeInstanceOf(DailyLogAlreadyFinalizedError)
  })

  it('does not create a Daily Log when a Task action fails', async () => {
    class FailingTaskRepository extends InMemoryTaskRepository {
      override async save(...args: Parameters<InMemoryTaskRepository['save']>) {
        if (args[1].version > 1) throw new Error('write failed')
        return super.save(...args)
      }
    }
    const tasks = new FailingTaskRepository()
    const taskService = new TaskService(tasks, {
      createId: () => 'task-1',
      now: () => now,
    })
    await taskService.create({ userId, title: 'Will fail', plannedDate: date })
    const logs = new InMemoryDailyLogRepository()
    const query = new EndDayQuery({
      tasks,
      waiting: new InMemoryWaitingRepository(),
      memos: new InMemoryMemoRepository(),
      routines: new InMemoryRoutineRepository(),
      routineLogs: new InMemoryRoutineLogRepository(),
      projectNames: new MockTodayProjectNameResolver(),
    })
    const service = new EndDayService(query, taskService, logs)
    await expect(
      service.finalize({
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: { 'task-1': 'later' },
      }),
    ).rejects.toThrow('write failed')
    await expect(logs.findByDate(userId, date)).resolves.toBeNull()
  })
})
