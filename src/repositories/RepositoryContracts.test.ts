import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import type { SyncEntity, UserId } from '@/domain/shared'
import type { RepositoryWriteOptions } from './contracts'
import {
  RepositoryOwnershipError,
  RepositoryVersionConflictError,
} from './errors'
import { createTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createRoutineLog } from '@/domain/routineLog'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { InMemoryTaskRepository } from './inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from './inMemory/InMemoryWaitingRepository'
import { InMemoryMemoRepository } from './inMemory/InMemoryMemoRepository'
import { InMemoryRoutineRepository } from './inMemory/InMemoryRoutineRepository'
import { InMemoryRoutineLogRepository } from './inMemory/InMemoryRoutineLogRepository'
import { DexieTaskRepository } from './dexie/DexieTaskRepository'
import { DexieWaitingRepository } from './dexie/DexieWaitingRepository'
import { DexieMemoRepository } from './dexie/DexieMemoRepository'
import { DexieRoutineRepository } from './dexie/DexieRoutineRepository'
import { DexieRoutineLogRepository } from './dexie/DexieRoutineLogRepository'

const createdAt = '2026-08-25T08:00:00.000Z'
const updatedAt = '2026-08-25T09:00:00.000Z'

interface ContractRepository<T extends SyncEntity> {
  getById(userId: UserId, id: string): Promise<T | null>
  list(userId: UserId): Promise<T[]>
  save(
    userId: UserId,
    entity: T,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

interface ContractHarness<T extends SyncEntity> {
  repository: ContractRepository<T>
  cleanup(): Promise<void>
}

type HarnessFactory<T extends SyncEntity> = () => Promise<ContractHarness<T>>

function runVersionedRepositoryContract<T extends SyncEntity>(
  name: string,
  createHarness: HarnessFactory<T>,
  createEntity: (userId: UserId, id: string) => T,
) {
  describe(`${name} ownership and version contract`, () => {
    it('requires version 1 on create and strict +1 updates', async () => {
      const harness = await createHarness()
      try {
        const entity = createEntity('user-1', `${name}-version`)
        await expect(
          harness.repository.save('user-1', { ...entity, version: 2 }),
        ).rejects.toBeInstanceOf(RepositoryVersionConflictError)

        await harness.repository.save('user-1', entity)
        await expect(
          harness.repository.save(
            'user-1',
            { ...entity, updatedAt, version: 3 },
            { expectedVersion: 1 },
          ),
        ).rejects.toBeInstanceOf(RepositoryVersionConflictError)

        const updated = { ...entity, updatedAt, version: 2 }
        await harness.repository.save('user-1', updated, {
          expectedVersion: 1,
        })
        await expect(
          harness.repository.save(
            'user-1',
            { ...updated, version: 3 },
            { expectedVersion: 1 },
          ),
        ).rejects.toBeInstanceOf(RepositoryVersionConflictError)
      } finally {
        await harness.cleanup()
      }
    })

    it('enforces ownership and hides other users and tombstones', async () => {
      const harness = await createHarness()
      try {
        const entity = createEntity('user-1', `${name}-ownership`)
        await harness.repository.save('user-1', entity)
        await expect(
          harness.repository.getById('user-2', entity.id),
        ).resolves.toBeNull()
        await expect(harness.repository.list('user-2')).resolves.toEqual([])
        await expect(
          harness.repository.save('user-2', {
            ...entity,
            updatedAt,
            version: 2,
          }),
        ).rejects.toBeInstanceOf(RepositoryOwnershipError)

        await harness.repository.save(
          'user-1',
          { ...entity, updatedAt, deletedAt: updatedAt, version: 2 },
          { expectedVersion: 1 },
        )
        await expect(
          harness.repository.getById('user-1', entity.id),
        ).resolves.toBeNull()
        await expect(harness.repository.list('user-1')).resolves.toEqual([])
      } finally {
        await harness.cleanup()
      }
    })
  })
}

function memoryHarness<T extends SyncEntity>(
  repository: ContractRepository<T>,
): Promise<ContractHarness<T>> {
  return Promise.resolve({ repository, cleanup: async () => undefined })
}

let databaseSequence = 0
async function dexieHarness<T extends SyncEntity>(
  createRepository: (database: DailyWorkDatabase) => ContractRepository<T>,
): Promise<ContractHarness<T>> {
  const name = `repository-contract-${++databaseSequence}`
  const database = new DailyWorkDatabase(name)
  await database.open()
  return {
    repository: createRepository(database),
    cleanup: async () => {
      database.close()
      await Dexie.delete(name)
    },
  }
}

const task = (userId: UserId, id: string) =>
  createTask(
    { userId, title: 'Contract Task', plannedDate: '2026-08-25' },
    { id, now: createdAt },
  )
const waiting = (userId: UserId, id: string) =>
  createWaiting(
    { userId, title: 'Contract Waiting', followUpDate: '2026-08-25' },
    { id, now: createdAt },
  )
const memo = (userId: UserId, id: string) =>
  createMemo({ userId, content: 'Contract Memo' }, { id, now: createdAt })
const routine = (userId: UserId, id: string) =>
  createRoutine(
    {
      userId,
      title: 'Contract Routine',
      schedule: { frequency: 'daily' },
      timezone: 'UTC',
    },
    { id, now: createdAt },
  )
const routineLog = (userId: UserId, id: string) =>
  createRoutineLog(
    { userId, routineId: 'routine-contract', date: '2026-08-25' },
    { id, now: createdAt },
  )

runVersionedRepositoryContract(
  'InMemoryTaskRepository',
  () => {
    const repository = new InMemoryTaskRepository()
    return memoryHarness({
      getById: (userId, id) => repository.getById(userId, id),
      list: (userId) => repository.find(userId, {}),
      save: (userId, entity, options) =>
        repository.save(userId, entity, options),
    })
  },
  task,
)
runVersionedRepositoryContract(
  'DexieTaskRepository',
  () =>
    dexieHarness((database) => {
      const repository = new DexieTaskRepository(database)
      return {
        getById: (userId, id) => repository.getById(userId, id),
        list: (userId) => repository.find(userId, {}),
        save: (userId, entity, options) =>
          repository.save(userId, entity, options),
      }
    }),
  task,
)

for (const adapter of [
  {
    name: 'InMemoryWaitingRepository',
    create: () => {
      const repository = new InMemoryWaitingRepository()
      return memoryHarness({
        getById: (userId, id) => repository.getById(userId, id),
        list: (userId) => repository.find(userId, {}),
        save: (userId, entity, options) =>
          repository.save(userId, entity, options),
      })
    },
  },
  {
    name: 'DexieWaitingRepository',
    create: () =>
      dexieHarness((database) => {
        const repository = new DexieWaitingRepository(database)
        return {
          getById: (userId, id) => repository.getById(userId, id),
          list: (userId) => repository.find(userId, {}),
          save: (userId, entity, options) =>
            repository.save(userId, entity, options),
        }
      }),
  },
] as const) {
  runVersionedRepositoryContract(adapter.name, adapter.create, waiting)
}

for (const adapter of [
  {
    name: 'InMemoryMemoRepository',
    create: () => {
      const repository = new InMemoryMemoRepository()
      return memoryHarness({
        getById: (userId, id) => repository.getById(userId, id),
        list: (userId) => repository.find(userId, {}),
        save: (userId, entity, options) =>
          repository.save(userId, entity, options),
      })
    },
  },
  {
    name: 'DexieMemoRepository',
    create: () =>
      dexieHarness((database) => {
        const repository = new DexieMemoRepository(database)
        return {
          getById: (userId, id) => repository.getById(userId, id),
          list: (userId) => repository.find(userId, {}),
          save: (userId, entity, options) =>
            repository.save(userId, entity, options),
        }
      }),
  },
] as const) {
  runVersionedRepositoryContract(adapter.name, adapter.create, memo)
}

for (const adapter of [
  {
    name: 'InMemoryRoutineRepository',
    create: () => {
      const repository = new InMemoryRoutineRepository()
      return memoryHarness({
        getById: (userId, id) => repository.getById(userId, id),
        list: (userId) => repository.findByStatus(userId, ['active']),
        save: (userId, entity, options) =>
          repository.save(userId, entity, options),
      })
    },
  },
  {
    name: 'DexieRoutineRepository',
    create: () =>
      dexieHarness((database) => {
        const repository = new DexieRoutineRepository(database)
        return {
          getById: (userId, id) => repository.getById(userId, id),
          list: (userId) => repository.findByStatus(userId, ['active']),
          save: (userId, entity, options) =>
            repository.save(userId, entity, options),
        }
      }),
  },
] as const) {
  runVersionedRepositoryContract(adapter.name, adapter.create, routine)
}

for (const adapter of [
  {
    name: 'InMemoryRoutineLogRepository',
    create: () => {
      const repository = new InMemoryRoutineLogRepository()
      return memoryHarness({
        getById: (userId, id) =>
          repository
            .findForDate(userId, '2026-08-25')
            .then(
              (records) => records.find((record) => record.id === id) ?? null,
            ),
        list: (userId) => repository.findForDate(userId, '2026-08-25'),
        save: (userId, entity, options) =>
          repository.save(userId, entity, options),
      })
    },
  },
  {
    name: 'DexieRoutineLogRepository',
    create: () =>
      dexieHarness((database) => {
        const repository = new DexieRoutineLogRepository(database)
        return {
          getById: (userId, id) =>
            repository
              .findForDate(userId, '2026-08-25')
              .then(
                (records) => records.find((record) => record.id === id) ?? null,
              ),
          list: (userId) => repository.findForDate(userId, '2026-08-25'),
          save: (userId, entity, options) =>
            repository.save(userId, entity, options),
        }
      }),
  },
] as const) {
  runVersionedRepositoryContract(adapter.name, adapter.create, routineLog)
}
