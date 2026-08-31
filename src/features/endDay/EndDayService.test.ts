import { describe, expect, it } from 'vitest'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createRoutineLog } from '@/domain/routineLog'
import { createWaiting } from '@/domain/waiting'
import { completeTask, createTask } from '@/domain/task'
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
import { InMemoryUnitOfWork } from '@/unitOfWork/inMemory/InMemoryUnitOfWork'
import { InMemoryMutationJournal } from '@/sync/inMemory/InMemoryMutationJournal'

const userId = 'user-1'
const date = '2026-08-25'
const now = '2026-08-25T12:00:00.000Z'

function setup(
  overrides: {
    tasks?: InMemoryTaskRepository
    logs?: InMemoryDailyLogRepository
    activities?: InMemoryActivityRepository
  } = {},
) {
  const tasks = overrides.tasks ?? new InMemoryTaskRepository()
  const waiting = new InMemoryWaitingRepository()
  const memos = new InMemoryMemoRepository()
  const routines = new InMemoryRoutineRepository()
  const routineLogs = new InMemoryRoutineLogRepository()
  const activities = overrides.activities ?? new InMemoryActivityRepository()
  const logs = overrides.logs ?? new InMemoryDailyLogRepository()
  const journal = new InMemoryMutationJournal()
  const unitOfWork = new InMemoryUnitOfWork(
    {
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      dailyLogs: logs,
    },
    { journal },
  )
  let taskId = 0
  const taskService = new TaskService(tasks, unitOfWork, {
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
    unitOfWork,
    new ActivityService(activities, {
      createId: () => 'activity-1',
      now: () => now,
    }),
    { now: () => now },
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
    journal,
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
      commandId: 'log-1',
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
    expect(log.finalizeTimezone).toBe('Asia/Shanghai')
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
        commandId: 'different-command',
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
    const logs = new InMemoryDailyLogRepository()
    const waiting = new InMemoryWaitingRepository()
    const memos = new InMemoryMemoRepository()
    const routines = new InMemoryRoutineRepository()
    const routineLogs = new InMemoryRoutineLogRepository()
    const unitOfWork = new InMemoryUnitOfWork({
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      dailyLogs: logs,
    })
    const taskService = new TaskService(tasks, unitOfWork, {
      createId: () => 'task-1',
      now: () => now,
    })
    await taskService.create({ userId, title: 'Will fail', plannedDate: date })
    const query = new EndDayQuery({
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      projectNames: new MockTodayProjectNameResolver(),
    })
    const service = new EndDayService(query, taskService, logs, unitOfWork)
    await expect(
      service.finalize({
        commandId: 'failing-command',
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: { 'task-1': 'later' },
      }),
    ).rejects.toThrow('write failed')
    await expect(logs.findByDate(userId, date)).resolves.toBeNull()
  })

  it('rolls back every Task when the Nth End Day decision fails', async () => {
    class FailingSecondUpdateRepository extends InMemoryTaskRepository {
      private updates = 0

      override async save(...args: Parameters<InMemoryTaskRepository['save']>) {
        if (args[1].version > 1 && ++this.updates === 2) {
          throw new Error('second Task update failed')
        }
        return super.save(...args)
      }
    }
    const tasks = new FailingSecondUpdateRepository()
    const context = setup({ tasks })
    const first = await context.taskService.create({
      userId,
      title: 'First rollback Task',
      plannedDate: date,
    })
    const second = await context.taskService.create({
      userId,
      title: 'Second rollback Task',
      plannedDate: date,
    })

    await expect(
      context.service.finalize({
        commandId: 'nth-task-failure',
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: { [first.id]: 'later', [second.id]: 'tomorrow' },
      }),
    ).rejects.toThrow('second Task update failed')

    await expect(
      context.tasks.getById(userId, first.id),
    ).resolves.toMatchObject({ status: 'todo', plannedDate: date, version: 1 })
    await expect(
      context.tasks.getById(userId, second.id),
    ).resolves.toMatchObject({ status: 'todo', plannedDate: date, version: 1 })
    await expect(context.logs.findByDate(userId, date)).resolves.toBeNull()
  })

  it('rolls back Task decisions when DailyLog persistence fails', async () => {
    class FailingDailyLogRepository extends InMemoryDailyLogRepository {
      override async finalize(
        ...args: Parameters<InMemoryDailyLogRepository['finalize']>
      ) {
        await super.finalize(...args)
        throw new Error('DailyLog write failed')
      }
    }
    const context = setup({ logs: new FailingDailyLogRepository() })
    const task = await context.taskService.create({
      userId,
      title: 'DailyLog rollback Task',
      plannedDate: date,
    })

    await expect(
      context.service.finalize({
        commandId: 'daily-log-failure',
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: { [task.id]: 'later' },
      }),
    ).rejects.toThrow('DailyLog write failed')

    await expect(context.tasks.getById(userId, task.id)).resolves.toMatchObject(
      {
        status: 'todo',
        version: 1,
      },
    )
    await expect(context.logs.findByDate(userId, date)).resolves.toBeNull()
  })

  it('rolls back Tasks and DailyLog when final Activity append fails', async () => {
    class FailingActivityRepository extends InMemoryActivityRepository {
      override async append(
        ...args: Parameters<InMemoryActivityRepository['append']>
      ) {
        await super.append(...args)
        throw new Error('Activity append failed')
      }
    }
    const activities = new FailingActivityRepository()
    const context = setup({ activities })
    const task = await context.taskService.create({
      userId,
      title: 'Activity rollback Task',
      plannedDate: date,
    })

    await expect(
      context.service.finalize({
        commandId: 'activity-failure',
        userId,
        date,
        timezone: 'UTC',
        summary: '',
        taskActions: { [task.id]: 'tomorrow' },
      }),
    ).rejects.toThrow('Activity append failed')

    await expect(context.tasks.getById(userId, task.id)).resolves.toMatchObject(
      {
        status: 'todo',
        plannedDate: date,
        version: 1,
      },
    )
    await expect(context.logs.findByDate(userId, date)).resolves.toBeNull()
    await expect(activities.find(userId, {})).resolves.toEqual([])
  })

  it('returns the same finalized result when commandId is retried', async () => {
    const context = setup()
    const task = await context.taskService.create({
      userId,
      title: 'Idempotent Task',
      plannedDate: date,
    })
    const input = {
      commandId: '00000000-0000-4000-8000-000000000090',
      userId,
      date,
      timezone: 'UTC',
      summary: 'once',
      taskActions: { [task.id]: 'later' as const },
    }

    const first = await context.service.finalize(input)
    const firstChanges = context.journal.listPending(userId)
    const retried = await context.service.finalize(input)

    expect(retried).toEqual(first)
    await expect(context.activities.find(userId, {})).resolves.toHaveLength(1)
    await expect(context.logs.findByDate(userId, date)).resolves.toEqual(first)
    expect(context.journal.listPending(userId)).toEqual(firstChanges)
    const mutation = firstChanges.find(
      (candidate) => candidate.mutationId === input.commandId,
    )
    expect(mutation?.changes).toHaveLength(3)
    expect(mutation?.changes.map((change) => change.entityType).sort()).toEqual(
      ['activity', 'daily_log', 'task'],
    )
    expect(
      mutation?.changes.every(
        (change) => change.entitySnapshot.userId === userId,
      ),
    ).toBe(true)
  })

  it('selects completed Tasks by explicit End Day timezone across midnight', async () => {
    const context = setup()
    const created = createTask(
      {
        userId,
        title: 'Cross-midnight completion',
        plannedDate: '2026-08-23',
      },
      { id: 'cross-midnight', now: '2026-08-23T10:00:00.000Z' },
    )
    await context.tasks.save(userId, created)
    const completed = completeTask(created, '2026-08-25T00:30:00.000Z')
    await context.tasks.save(userId, completed, { expectedVersion: 1 })

    const losAngeles = await context.query.execute(
      { userId, date: '2026-08-24', timezone: 'America/Los_Angeles' },
      undefined,
      '2026-08-25T00:30:00.000Z',
    )
    const kiritimati = await context.query.execute(
      { userId, date: '2026-08-25', timezone: 'Pacific/Kiritimati' },
      undefined,
      '2026-08-25T00:30:00.000Z',
    )
    expect(losAngeles.completedTasks.map((task) => task.id)).toContain(
      completed.id,
    )
    expect(kiritimati.completedTasks.map((task) => task.id)).toContain(
      completed.id,
    )
  })
})
