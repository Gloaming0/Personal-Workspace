import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import {
  currentDatabaseVersion,
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import { TaskService } from '@/features/tasks/TaskService'
import { DefaultTodayDashboardQuery } from '@/features/today/TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from '@/features/today/TodayDashboardViewModelAssembler'
import { MockTodaySupportingViewModelSource } from '@/features/today/MockTodaySupportingViewModelSource'
import { MockTodayProjectNameResolver } from '@/features/today/MockTodayProjectNameResolver'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { DexieTaskRepository } from './DexieTaskRepository'

let databaseSequence = 0

describe('DexieTaskRepository', () => {
  let databaseName = ''
  const openDatabases: DailyWorkDatabase[] = []

  async function openRepository() {
    const database = new DailyWorkDatabase(databaseName)
    openDatabases.push(database)
    await initializeLocalDatabase(database)
    return {
      database,
      repository: new DexieTaskRepository(database),
    }
  }

  afterEach(async () => {
    openDatabases.forEach((database) => database.close())
    if (databaseName) await Dexie.delete(databaseName)
  })

  it('persists create, focus, complete, and reopen across database instances', async () => {
    databaseName = `task-lifecycle-${++databaseSequence}`
    const firstConnection = await openRepository()
    let clockTick = 0
    const firstService = new TaskService(firstConnection.repository, {
      now: () => `2026-08-24T10:00:0${clockTick++}.000Z`,
    })
    const created = await firstService.create({
      userId: 'local-user',
      title: 'Persistent task',
      plannedDate: '2026-08-24',
    })
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(created.version).toBe(1)

    const focused = await firstService.setFocus(created.id, '2026-08-24')
    expect(focused).toMatchObject({ focusDate: '2026-08-24', version: 2 })
    firstConnection.database.close()

    const secondConnection = await openRepository()
    await expect(
      secondConnection.repository.find({ focusDate: '2026-08-24' }),
    ).resolves.toHaveLength(1)
    const secondService = new TaskService(secondConnection.repository, {
      now: () => '2026-08-24T11:00:00.000Z',
    })
    const completed = await secondService.complete(created.id)
    expect(completed).toMatchObject({
      status: 'done',
      completedAt: '2026-08-24T11:00:00.000Z',
      focusDate: null,
      version: 3,
    })
    secondConnection.database.close()

    const thirdConnection = await openRepository()
    await expect(
      thirdConnection.repository.getById(created.id),
    ).resolves.toMatchObject({
      status: 'done',
      completedAt: '2026-08-24T11:00:00.000Z',
      version: 3,
    })
    const thirdService = new TaskService(thirdConnection.repository, {
      now: () => '2026-08-24T12:00:00.000Z',
    })
    const reopened = await thirdService.reopen(created.id)
    expect(reopened).toMatchObject({
      status: 'todo',
      completedAt: null,
      version: 4,
    })
    thirdConnection.database.close()

    const fourthConnection = await openRepository()
    await expect(
      fourthConnection.repository.getById(created.id),
    ).resolves.toMatchObject({
      status: 'todo',
      completedAt: null,
      version: 4,
    })
    expect(fourthConnection.database.verno).toBe(currentDatabaseVersion)
    expect(fourthConnection.database.tasks.schema.primKey.name).toBe('id')
  })

  it('excludes soft-deleted rows and enforces sequential versions', async () => {
    databaseName = `task-soft-delete-${++databaseSequence}`
    const { database, repository } = await openRepository()
    const service = new TaskService(repository, {
      createId: () => 'task-soft-delete',
      now: () => '2026-08-24T09:00:00.000Z',
    })
    const task = await service.create({
      userId: 'local-user',
      title: 'Soft delete me',
      plannedDate: '2026-08-24',
    })

    await expect(
      repository.save(
        { ...task, title: 'Skipped version', version: 3 },
        { expectedVersion: 1 },
      ),
    ).rejects.toBeInstanceOf(RepositoryVersionConflictError)

    const deletedAt = '2026-08-24T13:00:00.000Z'
    await repository.save(
      { ...task, deletedAt, updatedAt: deletedAt, version: 2 },
      { expectedVersion: 1 },
    )

    await expect(repository.getById(task.id)).resolves.toBeNull()
    await expect(repository.find({ plannedOn: '2026-08-24' })).resolves.toEqual(
      [],
    )
    await expect(database.tasks.get(task.id)).resolves.toMatchObject({
      deletedAt,
      version: 2,
    })
  })

  it('keeps Today aggregation unchanged when Tasks come from Dexie', async () => {
    databaseName = `task-today-query-${++databaseSequence}`
    const firstConnection = await openRepository()
    let id = 0
    const service = new TaskService(firstConnection.repository, {
      createId: () => `task-${++id}`,
      now: () => '2026-08-24T09:00:00.000Z',
    })
    const focused = await service.create({
      userId: 'local-user',
      title: 'Dexie focus',
      plannedDate: '2026-08-24',
      priority: 'P1',
    })
    await service.setFocus(focused.id, '2026-08-24')
    const completed = await service.create({
      userId: 'local-user',
      title: 'Dexie completed',
      plannedDate: '2026-08-24',
    })
    await service.complete(completed.id)
    firstConnection.database.close()

    const secondConnection = await openRepository()
    const query = new DefaultTodayDashboardQuery({
      tasks: secondConnection.repository,
      waiting: new InMemoryWaitingRepository(),
      projectNames: new MockTodayProjectNameResolver(),
      supportingData: new MockTodaySupportingViewModelSource('en'),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
    })

    expect(result.tasks.map((task) => task.title)).toEqual([
      'Dexie focus',
      'Dexie completed',
    ])
    expect(result.focus.map((task) => task.title)).toEqual(['Dexie focus'])
    expect(result.summary.openTaskCount).toBe(1)
    expect(result.waiting).toHaveLength(0)
  })
})
