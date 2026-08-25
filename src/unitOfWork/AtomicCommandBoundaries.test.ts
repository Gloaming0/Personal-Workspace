import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { createActivity } from '@/domain/activity'
import { createTask } from '@/domain/task'
import { ActivityService } from '@/features/activity/ActivityService'
import { FocusLimitError, TaskService } from '@/features/tasks/TaskService'
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { DexieUnitOfWork } from './dexie/DexieUnitOfWork'

let sequence = 0

describe('Dexie atomic command boundaries', () => {
  let database: DailyWorkDatabase
  let databaseName: string

  beforeEach(async () => {
    databaseName = `atomic-command-${++sequence}`
    database = new DailyWorkDatabase(databaseName)
    await database.open()
  })

  afterEach(async () => {
    database.close()
    await Dexie.delete(databaseName)
  })

  it('rolls back an Entity when Activity append fails after its write', async () => {
    class FailingActivityRepository extends DexieActivityRepository {
      override async append(
        ...args: Parameters<DexieActivityRepository['append']>
      ) {
        await super.append(...args)
        throw new Error('injected Activity failure')
      }
    }
    const tasks = new DexieTaskRepository(database)
    const activities = new FailingActivityRepository(database)
    const unitOfWork = new DexieUnitOfWork(database, (transaction, stores) =>
      stores.includes('activities')
        ? {
            activities: new FailingActivityRepository(
              database,
              transaction.table('activities') as typeof database.activities,
            ),
          }
        : {},
    )
    const service = new TaskService(
      tasks,
      unitOfWork,
      {
        createId: () => 'task-activity-rollback',
        now: () => '2026-08-25T08:00:00.000Z',
      },
      new ActivityService(activities, {
        createId: () => 'activity-injected-failure',
        now: () => '2026-08-25T08:00:01.000Z',
      }),
    )

    await expect(
      service.create({
        userId: 'user-1',
        title: 'Must roll back',
        plannedDate: '2026-08-25',
      }),
    ).rejects.toThrow('injected Activity failure')
    await expect(database.tasks.count()).resolves.toBe(0)
    await expect(database.activities.count()).resolves.toBe(0)
  })

  it('rejects a fourth Focus without any Task or Activity partial write', async () => {
    const tasks = new DexieTaskRepository(database)
    const activities = new DexieActivityRepository(database)
    let entityId = 0
    let tick = 0
    const service = new TaskService(
      tasks,
      new DexieUnitOfWork(database),
      {
        createId: () => `focus-entity-${++entityId}`,
        now: () => `2026-08-25T08:00:${String(tick++).padStart(2, '0')}.000Z`,
      },
      new ActivityService(activities, {
        createId: () => `focus-activity-${++entityId}`,
        now: () => `2026-08-25T09:00:${String(tick++).padStart(2, '0')}.000Z`,
      }),
    )
    const created = []
    for (let index = 0; index < 4; index += 1) {
      created.push(
        await service.create({
          userId: 'user-1',
          title: `Focus ${index + 1}`,
          plannedDate: '2026-08-25',
        }),
      )
    }
    for (const task of created.slice(0, 3)) {
      await service.setFocus('user-1', task.id, '2026-08-25')
    }
    const activityCount = await database.activities.count()

    await expect(
      service.setFocus('user-1', created[3]!.id, '2026-08-25'),
    ).rejects.toBeInstanceOf(FocusLimitError)
    const focused = await tasks.find('user-1', { focusDate: '2026-08-25' })
    expect(focused).toHaveLength(3)
    expect(new Set(focused.map((task) => task.focusOrder)).size).toBe(3)
    await expect(
      tasks.getById('user-1', created[3]!.id),
    ).resolves.toMatchObject({ focusDate: null, focusOrder: null, version: 1 })
    await expect(database.activities.count()).resolves.toBe(activityCount)
  })

  it('serializes concurrent Focus commands into unique slots', async () => {
    const tasks = new DexieTaskRepository(database)
    const service = new TaskService(tasks, new DexieUnitOfWork(database), {
      createId: () => crypto.randomUUID(),
      now: () => '2026-08-25T08:00:00.000Z',
    })
    const [first, second] = await Promise.all([
      service.create({
        userId: 'user-1',
        title: 'Concurrent one',
        plannedDate: '2026-08-25',
      }),
      service.create({
        userId: 'user-1',
        title: 'Concurrent two',
        plannedDate: '2026-08-25',
      }),
    ])

    await Promise.all([
      service.setFocus('user-1', first.id, '2026-08-25'),
      service.setFocus('user-1', second.id, '2026-08-25'),
    ])
    const focused = await tasks.find('user-1', { focusDate: '2026-08-25' })
    expect(focused).toHaveLength(2)
    expect(new Set(focused.map((task) => task.focusOrder))).toEqual(
      new Set([1, 2]),
    )
  })

  it('rolls back all writes when expectedVersion conflicts', async () => {
    const tasks = new DexieTaskRepository(database)
    const activities = new DexieActivityRepository(database)
    const unitOfWork = new DexieUnitOfWork(database)
    const task = createTask(
      {
        userId: 'user-1',
        title: 'Versioned Task',
        plannedDate: '2026-08-25',
      },
      { id: 'task-version-conflict', now: '2026-08-25T08:00:00.000Z' },
    )
    await tasks.save('user-1', task)
    const activity = createActivity(
      {
        userId: 'user-1',
        eventType: 'task_completed',
        entityType: 'task',
        entityId: task.id,
        title: task.title,
      },
      { id: 'activity-before-conflict', now: '2026-08-25T09:00:00.000Z' },
    )

    await expect(
      unitOfWork.execute(['tasks', 'activities'], async (transaction) => {
        const scopedTasks = transaction.repository('tasks')
        const scopedActivities = transaction.repository('activities')
        const versionTwo = {
          ...task,
          title: 'Tentative update',
          updatedAt: '2026-08-25T09:00:00.000Z',
          version: 2,
        }
        await scopedTasks.save('user-1', versionTwo, { expectedVersion: 1 })
        await scopedActivities.append('user-1', activity)
        await scopedTasks.save(
          'user-1',
          {
            ...versionTwo,
            updatedAt: '2026-08-25T10:00:00.000Z',
            version: 3,
          },
          { expectedVersion: 1 },
        )
      }),
    ).rejects.toBeInstanceOf(RepositoryVersionConflictError)

    await expect(tasks.getById('user-1', task.id)).resolves.toEqual(task)
    await expect(activities.find('user-1', {})).resolves.toEqual([])
  })
})
