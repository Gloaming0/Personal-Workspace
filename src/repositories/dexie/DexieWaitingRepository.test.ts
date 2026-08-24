import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '@/domain/entities'
import { createTask } from '@/domain/task'
import {
  currentDatabaseVersion,
  DailyWorkDatabase,
  initializeLocalDatabase,
  taskStoreSchema,
} from '@/database/DailyWorkDatabase'
import { WaitingService } from '@/features/waiting/WaitingService'
import { DefaultTodayDashboardQuery } from '@/features/today/TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from '@/features/today/TodayDashboardViewModelAssembler'
import { MockTodaySupportingViewModelSource } from '@/features/today/MockTodaySupportingViewModelSource'
import { MockTodayProjectNameResolver } from '@/features/today/MockTodayProjectNameResolver'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { DexieTaskRepository } from './DexieTaskRepository'
import { DexieWaitingRepository } from './DexieWaitingRepository'

class Version1Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({ tasks: taskStoreSchema })
  }
}

let databaseSequence = 0

describe('DexieWaitingRepository', () => {
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

  it('persists Waiting lifecycle, edits, source Task, and versions', async () => {
    databaseName = `waiting-lifecycle-${++databaseSequence}`
    const firstDatabase = await openDatabase()
    const firstRepository = new DexieWaitingRepository(firstDatabase)
    let tick = 0
    const firstService = new WaitingService(firstRepository, {
      createId: () => 'waiting-persistent',
      now: () => `2026-08-24T10:00:0${tick++}.000Z`,
    })
    const created = await firstService.create({
      userId: 'local-user',
      title: 'Persistent approval',
      person: 'Mina',
      sourceTaskId: 'task-origin',
      followUpDate: '2026-08-24',
    })
    await firstService.edit(created.id, { notes: 'Review response' })
    const confirmed = await firstService.confirm(created.id)
    expect(confirmed).toMatchObject({ status: 'confirmed', version: 3 })
    firstDatabase.close()

    const secondDatabase = await openDatabase()
    const secondRepository = new DexieWaitingRepository(secondDatabase)
    await expect(secondRepository.getById(created.id)).resolves.toMatchObject({
      title: 'Persistent approval',
      notes: 'Review response',
      sourceTaskId: 'task-origin',
      status: 'confirmed',
      version: 3,
    })
    const secondService = new WaitingService(secondRepository, {
      now: () => '2026-08-24T11:00:00.000Z',
    })
    const closed = await secondService.close(created.id)
    expect(closed).toMatchObject({ status: 'closed', version: 4 })
    secondDatabase.close()

    const thirdDatabase = await openDatabase()
    const thirdRepository = new DexieWaitingRepository(thirdDatabase)
    const thirdService = new WaitingService(thirdRepository, {
      now: () => '2026-08-24T12:00:00.000Z',
    })
    const reopened = await thirdService.reopen(created.id)
    expect(reopened).toMatchObject({
      status: 'waiting',
      confirmedAt: null,
      closedAt: null,
      version: 5,
    })
    thirdDatabase.close()

    const fourthDatabase = await openDatabase()
    await expect(
      new DexieWaitingRepository(fourthDatabase).getById(created.id),
    ).resolves.toMatchObject({ status: 'waiting', version: 5 })
  })

  it('excludes soft-deleted rows and rejects skipped versions', async () => {
    databaseName = `waiting-soft-delete-${++databaseSequence}`
    const database = await openDatabase()
    const repository = new DexieWaitingRepository(database)
    const service = new WaitingService(repository, {
      createId: () => 'waiting-soft-delete',
      now: () => '2026-08-24T09:00:00.000Z',
    })
    const waiting = await service.create({
      userId: 'local-user',
      title: 'Soft delete waiting',
    })

    await expect(
      repository.save({ ...waiting, version: 3 }, { expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(RepositoryVersionConflictError)

    const deletedAt = '2026-08-24T13:00:00.000Z'
    await repository.save(
      { ...waiting, deletedAt, updatedAt: deletedAt, version: 2 },
      { expectedVersion: 1 },
    )
    await expect(repository.getById(waiting.id)).resolves.toBeNull()
    await expect(repository.find({})).resolves.toEqual([])
    await expect(database.confirmations.get(waiting.id)).resolves.toMatchObject(
      { deletedAt, version: 2 },
    )
  })

  it('upgrades Version 1 to Version 2 without losing Task data', async () => {
    databaseName = `waiting-upgrade-${++databaseSequence}`
    const legacy = new Version1Database(databaseName)
    connections.push(legacy)
    await legacy.open()
    const task = createTask(
      {
        userId: 'local-user',
        title: 'Task from Version 1',
        plannedDate: '2026-08-24',
      },
      { id: 'legacy-task', now: '2026-08-24T08:00:00.000Z' },
    )
    await legacy.tasks.add(task)
    legacy.close()

    const upgraded = await openDatabase()
    expect(upgraded.verno).toBe(currentDatabaseVersion)
    await expect(upgraded.tasks.get(task.id)).resolves.toEqual(task)
    expect(upgraded.tables.map((table) => table.name)).toContain(
      'confirmations',
    )
  })

  it('aggregates persisted Waiting with due-first ordering and project names', async () => {
    databaseName = `waiting-today-${++databaseSequence}`
    const database = await openDatabase()
    const waitingRepository = new DexieWaitingRepository(database)
    let id = 0
    const service = new WaitingService(waitingRepository, {
      createId: () => `waiting-${++id}`,
      now: () => '2026-08-20T09:00:00.000Z',
    })
    await service.create({
      userId: 'local-user',
      title: 'Future follow-up',
      followUpDate: '2026-08-25',
    })
    const due = await service.create({
      userId: 'local-user',
      title: 'Due follow-up',
      followUpDate: '2026-08-24',
      projectId: 'project-1',
    })
    const confirmed = await service.create({
      userId: 'local-user',
      title: 'Already confirmed',
      followUpDate: '2026-08-20',
    })
    await service.confirm(confirmed.id)

    const query = new DefaultTodayDashboardQuery({
      tasks: new DexieTaskRepository(database),
      waiting: waitingRepository,
      projectNames: new MockTodayProjectNameResolver(
        new Map([['project-1', 'Launch project']]),
      ),
      supportingData: new MockTodaySupportingViewModelSource('en'),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
    })

    expect(result.waiting.map((item) => item.title)).toEqual([
      'Due follow-up',
      'Future follow-up',
      'Already confirmed',
    ])
    expect(result.waiting[0]).toMatchObject({
      waitingId: due.id,
      needsFollowUp: true,
      projectName: 'Launch project',
    })
    expect(result.waiting[2]?.needsFollowUp).toBe(false)
    expect(result.summary.waitingCount).toBe(3)
    expect(await database.confirmations.get(due.id)).not.toHaveProperty(
      'needsFollowUp',
    )
  })
})
