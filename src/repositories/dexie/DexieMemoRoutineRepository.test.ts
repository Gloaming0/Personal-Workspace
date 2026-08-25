import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Memo, Task, Waiting } from '@/domain/entities'
import { createMemo } from '@/domain/memo'
import { createTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import {
  confirmationStoreSchema,
  currentDatabaseVersion,
  DailyWorkDatabase,
  initializeLocalDatabase,
  memoStoreSchema,
  taskStoreSchema,
} from '@/database/DailyWorkDatabase'
import { MemoService } from '@/features/memos/MemoService'
import { RoutineService } from '@/features/routines/RoutineService'
import { DexieMemoRepository } from './DexieMemoRepository'
import { DexieRoutineRepository } from './DexieRoutineRepository'
import { DexieRoutineLogRepository } from './DexieRoutineLogRepository'

class Version2Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  confirmations!: EntityTable<Waiting, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ tasks: taskStoreSchema })
    this.version(2).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
    })
  }
}

class Version3Database extends Version2Database {
  memos!: EntityTable<Memo, 'id'>

  constructor(name: string) {
    super(name)
    this.version(3).stores({
      tasks: taskStoreSchema,
      confirmations: confirmationStoreSchema,
      memos: memoStoreSchema,
    })
  }
}

let sequence = 0

describe('Dexie Memo and Routine persistence', () => {
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

  it('persists Memo and Routine completion across database connections', async () => {
    databaseName = `memo-routine-persistence-${++sequence}`
    const first = await openDatabase()
    const memoRepository = new DexieMemoRepository(first)
    const memoService = new MemoService(memoRepository, {
      createId: () => 'memo-persistent',
      now: () => '2026-08-24T09:00:00.000Z',
    })
    const memo = await memoService.create({
      userId: 'local-user',
      content: 'Persistent memo',
    })
    await memoService.pin('local-user', memo.id)

    const routineRepository = new DexieRoutineRepository(first)
    const logRepository = new DexieRoutineLogRepository(first)
    let id = 0
    const routineService = new RoutineService(
      routineRepository,
      logRepository,
      {
        createId: () => `routine-entity-${++id}`,
        now: () => '2026-08-24T10:00:00.000Z',
      },
    )
    const routine = await routineService.create({
      userId: 'local-user',
      title: 'Persistent routine',
      schedule: { frequency: 'daily' },
      timezone: 'Asia/Shanghai',
    })
    await routineService.complete('local-user', routine.id, '2026-08-24')
    first.close()

    const second = await openDatabase()
    await expect(
      new DexieMemoRepository(second).getById('local-user', memo.id),
    ).resolves.toMatchObject({ pinned: true, version: 2 })
    await expect(
      new DexieRoutineRepository(second).getById('local-user', routine.id),
    ).resolves.toMatchObject({ title: 'Persistent routine', version: 1 })
    await expect(
      new DexieRoutineLogRepository(second).findByRoutineAndDate(
        'local-user',
        routine.id,
        '2026-08-24',
      ),
    ).resolves.toMatchObject({ routineId: routine.id })
  })

  it('upgrades v2 through v3 to v4 without losing Task, Waiting, or Memo', async () => {
    databaseName = `memo-routine-migration-${++sequence}`
    const v2 = new Version2Database(databaseName)
    connections.push(v2)
    await v2.open()
    const task = createTask(
      {
        userId: 'local-user',
        title: 'Task from v2',
        plannedDate: '2026-08-24',
      },
      { id: 'task-v2', now: '2026-08-24T08:00:00.000Z' },
    )
    const waiting = createWaiting(
      { userId: 'local-user', title: 'Waiting from v2' },
      { id: 'waiting-v2', now: '2026-08-24T08:10:00.000Z' },
    )
    await v2.tasks.add(task)
    await v2.confirmations.add(waiting)
    v2.close()

    const v3 = new Version3Database(databaseName)
    connections.push(v3)
    await v3.open()
    const memo = createMemo(
      { userId: 'local-user', content: 'Memo from v3' },
      { id: 'memo-v3', now: '2026-08-24T08:20:00.000Z' },
    )
    await v3.memos.add(memo)
    v3.close()

    const v4 = await openDatabase()
    expect(v4.verno).toBe(currentDatabaseVersion)
    await expect(v4.tasks.get(task.id)).resolves.toEqual(task)
    await expect(v4.confirmations.get(waiting.id)).resolves.toEqual(waiting)
    await expect(v4.memos.get(memo.id)).resolves.toEqual(memo)
    expect(v4.tables.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        'tasks',
        'confirmations',
        'memos',
        'routines',
        'routine_logs',
      ]),
    )
  })

  it('keeps soft-deleted Memos in storage but out of business queries', async () => {
    databaseName = `memo-soft-delete-${++sequence}`
    const database = await openDatabase()
    const repository = new DexieMemoRepository(database)
    let tick = 0
    const service = new MemoService(repository, {
      createId: () => 'memo-deleted',
      now: () => `2026-08-24T12:00:0${tick++}.000Z`,
    })
    const memo = await service.create({
      userId: 'local-user',
      content: 'Delete me',
    })
    await service.delete('local-user', memo.id)
    await expect(repository.find('local-user', {})).resolves.toEqual([])
    await expect(database.memos.get(memo.id)).resolves.toMatchObject({
      version: 2,
    })
    expect((await database.memos.get(memo.id))?.deletedAt).not.toBeNull()
  })
})
