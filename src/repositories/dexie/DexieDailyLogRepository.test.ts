import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import { createTask } from '@/domain/task'
import {
  activityStoreSchema,
  confirmationStoreSchema,
  DailyWorkDatabase,
  dailyLogStoreSchema,
  memoStoreSchema,
  routineLogStoreSchema,
  routineStoreSchema,
  taskStoreSchema,
} from '@/database/DailyWorkDatabase'
import { finalizeDailyLog } from '@/domain/dailyLog'
import {
  DailyLogAlreadyFinalizedError,
  RepositoryOwnershipError,
} from '@/repositories/errors'
import { DexieDailyLogRepository } from './DexieDailyLogRepository'

class Version5Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>
  memos!: EntityTable<Memo, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_logs!: EntityTable<RoutineLog, 'id'>
  activities!: EntityTable<Activity, 'id'>
  constructor(name: string) {
    super(name)
    this.version(5).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
      memos: memoStoreSchema,
      routines: routineStoreSchema,
      routine_logs: routineLogStoreSchema,
      activities: activityStoreSchema,
    })
  }
}

class Version6Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>
  memos!: EntityTable<Memo, 'id'>
  routines!: EntityTable<Routine, 'id'>
  routine_logs!: EntityTable<RoutineLog, 'id'>
  activities!: EntityTable<Activity, 'id'>
  daily_logs!: EntityTable<DailyLog, 'id'>
  constructor(name: string) {
    super(name)
    this.version(6).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
      memos: memoStoreSchema,
      routines: routineStoreSchema,
      routine_logs: routineLogStoreSchema,
      activities: activityStoreSchema,
      daily_logs: dailyLogStoreSchema,
    })
  }
}

let sequence = 0
describe('Dexie Daily Log persistence', () => {
  const connections: Dexie[] = []
  let name = ''
  afterEach(async () => {
    connections.forEach((connection) => connection.close())
    if (name) await Dexie.delete(name)
  })

  it('upgrades v5 without data loss and rejects replacement for the same day', async () => {
    name = `daily-log-${++sequence}`
    const v5 = new Version5Database(name)
    connections.push(v5)
    await v5.open()
    const task = createTask(
      { userId: 'user-1', title: 'Preserved task', plannedDate: '2026-08-25' },
      { id: 'task-v5', now: '2026-08-25T08:00:00.000Z' },
    )
    await v5.tasks.add(task)
    v5.close()

    const v6 = new DailyWorkDatabase(name)
    connections.push(v6)
    await v6.open()
    await expect(v6.tasks.get(task.id)).resolves.toEqual(task)
    const repository = new DexieDailyLogRepository(v6)
    const log = finalizeDailyLog(
      {
        userId: 'user-1',
        date: '2026-08-25',
        finalizeTimezone: 'UTC',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
      },
      { id: 'log-1', now: '2026-08-25T16:00:00.000Z' },
    )
    await repository.finalize('user-1', log)
    await expect(
      repository.findByDate('user-2', '2026-08-25'),
    ).resolves.toBeNull()
    await expect(
      repository.finalize('user-2', { ...log, id: 'log-wrong-owner' }),
    ).rejects.toBeInstanceOf(RepositoryOwnershipError)
    await expect(
      repository.findByDate('user-1', '2026-08-25'),
    ).resolves.toEqual(log)
    await expect(
      repository.finalize('user-1', { ...log, id: 'log-2' }),
    ).rejects.toBeInstanceOf(DailyLogAlreadyFinalizedError)
  })

  it('migrates v6 DailyLog records with deterministic finalizeTimezone', async () => {
    name = `daily-log-v7-${++sequence}`
    const v6 = new Version6Database(name)
    connections.push(v6)
    await v6.open()
    const legacy = finalizeDailyLog(
      {
        userId: 'user-1',
        date: '2026-08-25',
        finalizeTimezone: 'UTC',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
      },
      { id: 'legacy-log', now: '2026-08-25T16:00:00.000Z' },
    )
    const rawLegacy = { ...legacy } as Partial<DailyLog>
    delete rawLegacy.finalizeTimezone
    await v6.daily_logs.add(rawLegacy as DailyLog)
    v6.close()

    const v7 = new DailyWorkDatabase(name)
    connections.push(v7)
    await v7.open()
    await expect(v7.daily_logs.get('legacy-log')).resolves.toMatchObject({
      id: 'legacy-log',
      finalizeTimezone: 'UTC',
      summary: '',
    })
  })
})
