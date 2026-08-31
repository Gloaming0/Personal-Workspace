import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { createTask, softDeleteTask } from '@/domain/task'
import { TaskService } from '@/features/tasks/TaskService'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { DexieUnitOfWork } from '@/unitOfWork/dexie/DexieUnitOfWork'
import type { UnitOfWorkTransaction } from '@/unitOfWork/contracts'
import { executeMutation } from './MutationCommandExecutor'
import { FixedDeviceIdentity } from './DeviceIdentityStore'
import { DexieSyncRepository } from './dexie/DexieSyncRepository'
import type { RemoteEntityChange } from './contracts'

const USER = 'local-user'
const NOW = '2026-08-31T08:00:00.000Z'
const ACK_AT = '2026-08-31T09:00:00.000Z'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const REMOTE_DEVICE = '00000000-0000-4000-8000-0000000000d2'
const MUTATION_A = '00000000-0000-4000-8000-0000000000a1'
const MUTATION_B = '00000000-0000-4000-8000-0000000000a2'
const MUTATION_C = '00000000-0000-4000-8000-0000000000a3'
const REMOTE_MUTATION = '00000000-0000-4000-8000-0000000000a9'
const TASK_ID = '00000000-0000-4000-8000-0000000000b1'

let sequence = 0
const connections: DailyWorkDatabase[] = []

function database(name = `local-sync-contract-${++sequence}`) {
  const value = new DailyWorkDatabase(name)
  connections.push(value)
  return value
}

function work(value: DailyWorkDatabase) {
  return new DexieUnitOfWork(value, undefined, {
    deviceIdentity: new FixedDeviceIdentity(DEVICE),
    now: () => NOW,
  })
}

async function seed(value: DailyWorkDatabase, id = TASK_ID) {
  const task = createTask(
    { userId: USER, title: 'Offline v1', plannedDate: '2026-08-31' },
    { id, now: NOW },
  )
  await value.tasks.add(task)
  return task
}

async function mutateTask(
  value: DailyWorkDatabase,
  mutationId: string,
  command: (
    tasks: TaskService,
    transaction: UnitOfWorkTransaction,
  ) => Promise<unknown>,
) {
  const transaction = work(value)
  const tasks = new TaskService(new DexieTaskRepository(value), transaction, {
    now: () => NOW,
  })
  return executeMutation(
    transaction,
    { mutationId, userId: USER, occurredAt: NOW },
    ['tasks'],
    (scope) => command(tasks, scope),
  )
}

function remoteChange(
  entity: ReturnType<typeof createTask>,
  serverRevision: number,
  overrides: Partial<RemoteEntityChange> = {},
): RemoteEntityChange {
  return {
    userId: USER,
    entityType: 'task',
    entity,
    operation: entity.deletedAt ? 'delete' : 'create',
    baseServerRevision: null,
    serverRevision,
    serverVersion: serverRevision,
    mutationId: REMOTE_MUTATION,
    deviceId: REMOTE_DEVICE,
    occurredAt: NOW,
    ...overrides,
  }
}

afterEach(async () => {
  const names = [...new Set(connections.map((value) => value.name))]
  connections.splice(0).forEach((value) => value.close())
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('Version 9 local sync contract', () => {
  it('persists immutable snapshots and causal predecessors for offline edits', async () => {
    const value = database()
    await value.open()
    await seed(value)

    await mutateTask(value, MUTATION_A, (tasks, transaction) =>
      tasks.complete(USER, TASK_ID, transaction),
    )
    await mutateTask(value, MUTATION_B, (tasks, transaction) =>
      tasks.reopen(USER, TASK_ID, transaction),
    )

    const [first, second] = await value.local_mutations
      .orderBy('commitOrder')
      .toArray()
    expect(first?.changes[0]).toMatchObject({
      resultingLocalVersion: 2,
      predecessorMutationId: null,
      entitySnapshot: { status: 'done', version: 2 },
    })
    expect(second?.changes[0]).toMatchObject({
      resultingLocalVersion: 3,
      predecessorMutationId: MUTATION_A,
      entitySnapshot: { status: 'todo', version: 3 },
    })
    expect(first?.changes[0]?.entitySnapshot).not.toEqual(
      second?.changes[0]?.entitySnapshot,
    )
  })

  it('keeps commit order across restart and does not consume it on rollback', async () => {
    const name = `commit-order-restart-${++sequence}`
    const firstConnection = database(name)
    await firstConnection.open()
    await seed(firstConnection)
    await mutateTask(firstConnection, MUTATION_A, (tasks, transaction) =>
      tasks.complete(USER, TASK_ID, transaction),
    )
    firstConnection.close()

    const secondConnection = database(name)
    await secondConnection.open()
    const transaction = work(secondConnection)
    await expect(
      executeMutation(
        transaction,
        { mutationId: MUTATION_B, userId: USER },
        ['tasks'],
        async (scope) => {
          const repository = scope.repository('tasks')
          const current = await repository.getById(USER, TASK_ID)
          await repository.save(
            USER,
            {
              ...current!,
              title: 'rolled back',
              version: 3,
              updatedAt: ACK_AT,
            },
            { expectedVersion: 2 },
          )
          throw new Error('rollback')
        },
      ),
    ).rejects.toThrow('rollback')
    await mutateTask(secondConnection, MUTATION_C, (tasks, transaction) =>
      tasks.reopen(USER, TASK_ID, transaction),
    )

    const records = await secondConnection.local_mutations
      .orderBy('commitOrder')
      .toArray()
    expect(records.map((record) => record.commitOrder)).toEqual([1, 2])
    await expect(
      secondConnection.local_mutations.get(MUTATION_B),
    ).resolves.toBeUndefined()
  })

  it('acknowledges each entity idempotently without overwriting later local metadata', async () => {
    const value = database()
    await value.open()
    await seed(value)
    await mutateTask(value, MUTATION_A, (tasks, transaction) =>
      tasks.complete(USER, TASK_ID, transaction),
    )
    await mutateTask(value, MUTATION_B, (tasks, transaction) =>
      tasks.reopen(USER, TASK_ID, transaction),
    )
    const sync = new DexieSyncRepository(value)
    const acknowledgement = {
      mutationId: MUTATION_A,
      entityResults: [
        {
          entityType: 'task' as const,
          entityId: TASK_ID,
          serverRevision: 41,
          serverVersion: 7,
        },
      ],
    }
    await sync.markMutationAcknowledged(USER, acknowledgement, ACK_AT)
    await sync.markMutationAcknowledged(USER, acknowledgement, ACK_AT)

    await expect(
      sync.getSyncMetadata(USER, 'task', TASK_ID),
    ).resolves.toMatchObject({
      localVersion: 3,
      lastMutationId: MUTATION_B,
      lastAcknowledgedMutationId: MUTATION_A,
      serverRevision: 41,
      serverVersion: 7,
    })
    await expect(sync.listPendingMutations(USER, DEVICE)).resolves.toEqual([
      expect.objectContaining({
        mutationId: MUTATION_B,
        commitOrder: 2,
        changes: [expect.objectContaining({ baseServerRevision: 41 })],
      }),
    ])
  })

  it('recovers in-flight mutations and blocks causal successors after conflict', async () => {
    const value = database()
    await value.open()
    await seed(value)
    await mutateTask(value, MUTATION_A, (tasks, transaction) =>
      tasks.complete(USER, TASK_ID, transaction),
    )
    await mutateTask(value, MUTATION_B, (tasks, transaction) =>
      tasks.reopen(USER, TASK_ID, transaction),
    )
    const sync = new DexieSyncRepository(value)
    await sync.markMutationInFlight(USER, MUTATION_A)
    await expect(sync.recoverInFlight(USER, DEVICE)).resolves.toBe(1)
    await expect(value.local_mutations.get(MUTATION_A)).resolves.toMatchObject({
      status: 'pending',
    })

    const remote = createTask(
      { userId: USER, title: 'Remote edit', plannedDate: '2026-08-31' },
      { id: TASK_ID, now: NOW },
    )
    const result = await sync.applyRemotePage({
      userId: USER,
      deviceId: DEVICE,
      fromRevision: 0,
      toRevision: 1,
      changes: [remoteChange(remote, 1, { operation: 'update' })],
    })
    expect(result.conflicts[0]).toMatchObject({
      mutationId: MUTATION_A,
      conflict: { type: 'SameBaseConcurrentEdit' },
    })
    await expect(sync.listPendingMutations(USER, DEVICE)).resolves.toEqual([])
    await expect(value.local_mutations.get(MUTATION_B)).resolves.toMatchObject({
      status: 'pending',
      changes: [expect.objectContaining({ predecessorMutationId: MUTATION_A })],
    })
  })

  it('rolls back an entire remote page and cursor when a later change fails', async () => {
    const value = database()
    await value.open()
    const conflictingId = '00000000-0000-4000-8000-0000000000b3'
    await value.tasks.add(
      createTask(
        {
          userId: 'other-user',
          title: 'Owned elsewhere',
          plannedDate: '2026-08-31',
        },
        { id: conflictingId, now: NOW },
      ),
    )
    const first = createTask(
      { userId: USER, title: 'Must roll back', plannedDate: '2026-08-31' },
      { id: TASK_ID, now: NOW },
    )
    const second = createTask(
      { userId: USER, title: 'Collision', plannedDate: '2026-08-31' },
      { id: conflictingId, now: NOW },
    )
    const sync = new DexieSyncRepository(value)
    await expect(
      sync.applyRemotePage({
        userId: USER,
        deviceId: DEVICE,
        fromRevision: 0,
        toRevision: 2,
        changes: [
          remoteChange(first, 1),
          remoteChange(second, 2, { mutationId: MUTATION_B }),
        ],
      }),
    ).rejects.toMatchObject({ conflict: { type: 'OwnershipConflict' } })
    await expect(value.tasks.get(TASK_ID)).resolves.toBeUndefined()
    await expect(sync.getPullCursor(USER, DEVICE)).resolves.toBe(0)
    await expect(value.sync_metadata.count()).resolves.toBe(0)
  })

  it('replays remote pages idempotently and applies complete tombstones', async () => {
    const value = database()
    await value.open()
    const tombstone = softDeleteTask(
      createTask(
        { userId: USER, title: 'Remote tombstone', plannedDate: '2026-08-31' },
        { id: TASK_ID, now: NOW },
      ),
      ACK_AT,
    )
    const page = {
      userId: USER,
      deviceId: DEVICE,
      fromRevision: 0,
      toRevision: 1,
      changes: [remoteChange(tombstone, 1, { operation: 'delete' as const })],
    }
    const sync = new DexieSyncRepository(value)
    await expect(sync.applyRemotePage(page)).resolves.toMatchObject({
      applied: 1,
      cursor: 1,
    })
    await expect(sync.applyRemotePage(page)).resolves.toEqual({
      applied: 0,
      conflicts: [],
      cursor: 1,
    })
    await expect(
      sync.getEntityIncludingDeleted(USER, 'task', TASK_ID),
    ).resolves.toEqual(tombstone)
    await expect(
      new DexieTaskRepository(value).getById(USER, TASK_ID),
    ).resolves.toBeNull()
  })
})
