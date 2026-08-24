import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import {
  activityStoreSchema,
  confirmationStoreSchema,
  currentDatabaseVersion,
  DailyWorkDatabase,
  initializeLocalDatabase,
  memoStoreSchema,
  routineLogStoreSchema,
  routineStoreSchema,
  taskStoreSchema,
} from '@/database/DailyWorkDatabase'
import { ActivityService } from '@/features/activity/ActivityService'
import { ActivityAppendConflictError } from '@/repositories/errors'
import { DexieActivityRepository } from './DexieActivityRepository'

class Version4Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>
  memos!: EntityTable<Memo, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_logs!: EntityTable<RoutineLog, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ tasks: taskStoreSchema })
    this.version(2).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
    })
    this.version(3).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
      memos: memoStoreSchema,
    })
    this.version(4).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
      memos: memoStoreSchema,
      routines: routineStoreSchema,
      routine_logs: routineLogStoreSchema,
    })
  }
}

let sequence = 0

describe('DexieActivityRepository', () => {
  let databaseName = ''
  const connections: Dexie[] = []

  async function openDatabase() {
    const database = new DailyWorkDatabase(databaseName)
    connections.push(database)
    await initializeLocalDatabase(database)
    return database
  }

  afterEach(async () => {
    connections.forEach((database) => database.close())
    if (databaseName) await Dexie.delete(databaseName)
  })

  it('appends immutably and returns newest events with a limit', async () => {
    databaseName = `activity-append-${++sequence}`
    const database = await openDatabase()
    const repository = new DexieActivityRepository(database)
    let id = 0
    let second = 0
    const service = new ActivityService(repository, {
      createId: () => `activity-${++id}`,
      now: () => `2026-08-24T10:00:${String(second++).padStart(2, '0')}.000Z`,
    })
    let firstId = ''
    for (let index = 0; index < 12; index += 1) {
      const activity = await service.record({
        userId: 'local-user',
        eventType: 'task_created',
        entityType: 'task',
        entityId: `task-${index}`,
        title: `Task ${index}`,
      })
      if (index === 0) firstId = activity.id
    }
    const recent = await repository.find({ limit: 10 })
    expect(recent).toHaveLength(10)
    expect(recent[0]?.payload).toMatchObject({ title: 'Task 11' })
    expect(recent.at(-1)?.payload).toMatchObject({ title: 'Task 2' })

    const first = (await database.activities.get(firstId))!
    await expect(repository.append(first)).rejects.toBeInstanceOf(
      ActivityAppendConflictError,
    )
    await expect(database.activities.count()).resolves.toBe(12)
  })

  it('upgrades v4 to v5 without losing Task, Waiting, Memo, or Routine', async () => {
    databaseName = `activity-migration-${++sequence}`
    const v4 = new Version4Database(databaseName)
    connections.push(v4)
    await v4.open()
    const now = '2026-08-24T08:00:00.000Z'
    const task = createTask(
      {
        userId: 'local-user',
        title: 'Task from v4',
        plannedDate: '2026-08-24',
      },
      { id: 'task-v4', now },
    )
    const waiting = createWaiting(
      { userId: 'local-user', title: 'Waiting from v4' },
      { id: 'waiting-v4', now },
    )
    const memo = createMemo(
      { userId: 'local-user', content: 'Memo from v4' },
      { id: 'memo-v4', now },
    )
    const routine = createRoutine(
      {
        userId: 'local-user',
        title: 'Routine from v4',
        schedule: { frequency: 'daily' },
        timezone: 'UTC',
      },
      { id: 'routine-v4', now },
    )
    await v4.tasks.add(task)
    await v4.confirmations.add(waiting)
    await v4.memos.add(memo)
    await v4.routines.add(routine)
    v4.close()

    const v5 = await openDatabase()
    expect(v5.verno).toBe(currentDatabaseVersion)
    await expect(v5.tasks.get(task.id)).resolves.toEqual(task)
    await expect(v5.confirmations.get(waiting.id)).resolves.toEqual(waiting)
    await expect(v5.memos.get(memo.id)).resolves.toEqual(memo)
    await expect(v5.routines.get(routine.id)).resolves.toEqual(routine)
    expect(v5.tables.map((table) => table.name)).toContain('activities')
    expect(activityStoreSchema).toContain('[userId+occurredAt]')
  })
})
