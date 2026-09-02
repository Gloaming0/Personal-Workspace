import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudSyncPort } from '@/cloud/contracts'
import { CloudPortError } from '@/cloud/contracts'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { createTask } from '@/domain/task'
import { TaskService } from '@/features/tasks/TaskService'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { executeMutation } from '@/sync/MutationCommandExecutor'
import { FixedDeviceIdentity } from '@/sync/DeviceIdentityStore'
import type {
  LocalMutationRecord,
  MutationAck,
  RemoteEntityChange,
  SyncRepository,
} from '@/sync/contracts'
import { DexieUnitOfWork } from '@/unitOfWork/dexie/DexieUnitOfWork'
import { DexieSyncRepository } from '../dexie/DexieSyncRepository'
import type { SyncRunLock } from './contracts'
import { SyncEngine } from './SyncEngine'
import { SyncStatusStore } from './SyncStatusStore'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = '99999999-9999-4999-8999-999999999999'
const DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const REMOTE_DEVICE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TASK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const MUTATION_A = '11111111-1111-4111-8111-111111111111'
const MUTATION_B = '22222222-2222-4222-8222-222222222222'
const REMOTE_MUTATION = '33333333-3333-4333-8333-333333333333'
const NOW = '2026-08-31T08:00:00.000Z'

class ImmediateLock implements SyncRunLock {
  calls = 0
  async run<T>(task: () => Promise<T>) {
    this.calls += 1
    return { acquired: true as const, value: await task() }
  }
}

class MemoryCloud implements CloudSyncPort {
  readonly submitted: LocalMutationRecord[] = []
  readonly remote: RemoteEntityChange[] = []
  submitFailures: unknown[] = []
  pullFailures: unknown[] = []
  knownAck: MutationAck | null = null
  pageSizeSeen: number[] = []

  inspectCloudWorkspace = async () => ({
    hasData: this.remote.length > 0,
    highWatermark: this.remote.at(-1)?.serverRevision ?? 0,
  })
  getRemoteHighWatermark = async () => this.remote.at(-1)?.serverRevision ?? 0
  pullRemotePage = async (cursor: number, limit = 100) => {
    const failure = this.pullFailures.shift()
    if (failure) throw failure
    this.pageSizeSeen.push(limit)
    return {
      changes: this.remote
        .filter((change) => change.serverRevision > cursor)
        .slice(0, limit),
      highWatermark: this.remote.at(-1)?.serverRevision ?? 0,
    }
  }
  submitMutation = vi.fn(async (mutation: LocalMutationRecord) => {
    const failure = this.submitFailures.shift()
    if (failure) throw failure
    this.submitted.push(structuredClone(mutation))
    const entityResults = mutation.changes.map((change) => {
      const serverRevision = this.remote.length + 1
      this.remote.push({
        userId: mutation.userId,
        entityType: change.entityType,
        entity: structuredClone(change.entitySnapshot),
        operation: change.operation,
        baseServerRevision: change.baseServerRevision,
        serverRevision,
        serverVersion: change.resultingLocalVersion,
        mutationId: mutation.mutationId,
        deviceId: mutation.deviceId,
        occurredAt: mutation.occurredAt,
      })
      return {
        entityType: change.entityType,
        entityId: change.entityId,
        serverRevision,
        serverVersion: change.resultingLocalVersion,
      }
    })
    this.knownAck = { mutationId: mutation.mutationId, entityResults }
    return structuredClone(this.knownAck)
  })
  queryMutationResult = vi.fn(async () => structuredClone(this.knownAck))
  beginBootstrap = vi.fn()
  uploadBootstrapChunk = vi.fn()
  commitBootstrap = vi.fn()
  downloadBootstrapSnapshot = vi.fn()
}

let sequence = 0
describe('SyncEngine', () => {
  let database: DailyWorkDatabase
  let repository: DexieSyncRepository
  let cloud: MemoryCloud
  let lock: ImmediateLock
  let status: SyncStatusStore
  let engine: SyncEngine

  beforeEach(async () => {
    database = new DailyWorkDatabase(`sync-engine-${++sequence}`)
    await database.open()
    repository = new DexieSyncRepository(database)
    cloud = new MemoryCloud()
    lock = new ImmediateLock()
    status = new SyncStatusStore(`sync-engine-state-${sequence}`)
    engine = new SyncEngine(repository, cloud, lock, status, DEVICE, {
      now: () => NOW,
      pageSize: 1,
      delay: async () => undefined,
      online: () => true,
      retryPolicy: { maxAttempts: 2, delayForAttempt: () => 0 },
    })
  })

  afterEach(async () => {
    status.close()
    database.close()
    await Dexie.delete(database.name)
  })

  async function makeEligible(cursor = 0) {
    await database.sync_bootstrap.put({
      userId: USER,
      state: 'bootstrapped',
      updatedAt: NOW,
    })
    await database.sync_device_state.put({
      id: `${USER}:${DEVICE}`,
      userId: USER,
      deviceId: DEVICE,
      lastCommitOrder: 0,
      lastPulledRevision: cursor,
      updatedAt: NOW,
    })
  }

  async function seedAndMutate() {
    await makeEligible()
    await database.tasks.put(
      createTask(
        { userId: USER, title: 'Offline', plannedDate: '2026-08-31' },
        { id: TASK, now: NOW },
      ),
    )
    const unit = new DexieUnitOfWork(database, undefined, {
      deviceIdentity: new FixedDeviceIdentity(DEVICE),
      now: () => NOW,
    })
    const tasks = new TaskService(new DexieTaskRepository(database), unit, {
      now: () => NOW,
    })
    await executeMutation(
      unit,
      { mutationId: MUTATION_A, userId: USER, occurredAt: NOW },
      ['tasks'],
      (transaction) => tasks.complete(USER, TASK, transaction),
    )
    await executeMutation(
      unit,
      { mutationId: MUTATION_B, userId: USER, occurredAt: NOW },
      ['tasks'],
      (transaction) => tasks.reopen(USER, TASK, transaction),
    )
  }

  it('does not sync while signed out or before bootstrap and requires an initialized cursor', async () => {
    await expect(engine.sync(null)).resolves.toMatchObject({
      state: { status: 'auth_required' },
    })
    await expect(
      engine.sync({ kind: 'authenticated', userId: USER }),
    ).resolves.toMatchObject({ state: { status: 'blocked' } })
    expect(cloud.submitMutation).not.toHaveBeenCalled()
  })

  it('pushes immutable snapshots in commit order and acknowledges each revision', async () => {
    await seedAndMutate()

    const result = await engine.sync({ kind: 'authenticated', userId: USER })

    expect(result.state.status).toBe('idle')
    expect(cloud.submitted.map((item) => item.mutationId)).toEqual([
      MUTATION_A,
      MUTATION_B,
    ])
    expect(
      cloud.submitted.map((item) => item.changes[0]?.entitySnapshot),
    ).toMatchObject([{ status: 'done' }, { status: 'todo' }])
    await expect(database.local_mutations.toArray()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'acknowledged' }),
        expect.objectContaining({ status: 'acknowledged' }),
      ]),
    )
    await expect(repository.getPullCursor(USER, DEVICE)).resolves.toBe(2)
  })

  it('paginates deterministic pull pages and persists the cursor', async () => {
    await makeEligible()
    const first = createTask(
      { userId: USER, title: 'One', plannedDate: '2026-08-31' },
      { id: TASK, now: NOW },
    )
    const second = createTask(
      { userId: USER, title: 'Two', plannedDate: '2026-08-31' },
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now: NOW },
    )
    cloud.remote.push(
      {
        userId: USER,
        entityType: 'task',
        entity: first,
        operation: 'create',
        baseServerRevision: null,
        serverRevision: 1,
        serverVersion: 1,
        mutationId: REMOTE_MUTATION,
        deviceId: REMOTE_DEVICE,
        occurredAt: NOW,
      },
      {
        userId: USER,
        entityType: 'task',
        entity: second,
        operation: 'create',
        baseServerRevision: null,
        serverRevision: 2,
        serverVersion: 1,
        mutationId: '44444444-4444-4444-8444-444444444444',
        deviceId: REMOTE_DEVICE,
        occurredAt: NOW,
      },
    )

    await engine.sync({ kind: 'authenticated', userId: USER })

    await expect(database.tasks.count()).resolves.toBe(2)
    await expect(repository.getPullCursor(USER, DEVICE)).resolves.toBe(2)
    expect(cloud.pageSizeSeen).toEqual(expect.arrayContaining([1]))
  })

  it('retries a transient pull without advancing the durable cursor early', async () => {
    await makeEligible()
    cloud.pullFailures.push(
      new CloudPortError('pull_sync_changes_v1', 'request_failed'),
    )

    const result = await engine.sync({ kind: 'authenticated', userId: USER })

    expect(result.state.status).toBe('idle')
    await expect(repository.getPullCursor(USER, DEVICE)).resolves.toBe(0)
    expect(cloud.pageSizeSeen).toEqual([1, 1])
  })

  it('refreshes an expired session once before continuing Pull', async () => {
    await makeEligible()
    cloud.pullFailures.push(
      new CloudPortError('pull_sync_changes_v1', 'AuthenticationRequired'),
    )
    const refreshSession = vi.fn(async () => true)
    const refreshingEngine = new SyncEngine(
      repository,
      cloud,
      lock,
      status,
      DEVICE,
      {
        now: () => NOW,
        online: () => true,
        delay: async () => undefined,
        refreshSession,
      },
    )

    const result = await refreshingEngine.sync({
      kind: 'authenticated',
      userId: USER,
    })

    expect(result.state.status).toBe('idle')
    expect(refreshSession).toHaveBeenCalledOnce()
  })

  it('recovers an in-flight mutation and resolves an acknowledgement-lost retry idempotently', async () => {
    await seedAndMutate()
    await database.local_mutations.update(MUTATION_A, { status: 'in_flight' })
    cloud.submitFailures.push(
      new CloudPortError('apply_sync_mutation_v1', 'request_failed'),
    )
    cloud.knownAck = {
      mutationId: MUTATION_A,
      entityResults: [
        {
          entityType: 'task',
          entityId: TASK,
          serverRevision: 1,
          serverVersion: 2,
        },
      ],
    }

    await engine.sync({ kind: 'authenticated', userId: USER })

    await expect(
      database.local_mutations.get(MUTATION_A),
    ).resolves.toMatchObject({ status: 'acknowledged' })
    expect(cloud.queryMutationResult).toHaveBeenCalledWith(MUTATION_A)
  })

  it('quarantines intersecting local and remote edits without pushing the local candidate', async () => {
    await seedAndMutate()
    const remote = createTask(
      { userId: USER, title: 'Remote edit', plannedDate: '2026-08-31' },
      { id: TASK, now: NOW },
    )
    cloud.remote.push({
      userId: USER,
      entityType: 'task',
      entity: remote,
      operation: 'update',
      baseServerRevision: null,
      serverRevision: 1,
      serverVersion: 2,
      mutationId: REMOTE_MUTATION,
      deviceId: REMOTE_DEVICE,
      occurredAt: NOW,
    })

    const result = await engine.sync({ kind: 'authenticated', userId: USER })

    expect(result.state).toMatchObject({ status: 'conflict', conflictCount: 1 })
    expect(result.conflicts[0]).toMatchObject({
      conflictType: 'SameBaseConcurrentEdit',
      localCandidate: 'Offline',
      remoteCandidate: 'Remote edit',
    })
    expect(cloud.submitMutation).not.toHaveBeenCalled()
  })

  it('coalesces simultaneous triggers into one single-flight run', async () => {
    await makeEligible()
    await Promise.all([
      engine.sync({ kind: 'authenticated', userId: USER }),
      engine.sync({ kind: 'authenticated', userId: USER }),
      engine.sync({ kind: 'authenticated', userId: USER }),
    ])
    expect(lock.calls).toBe(1)
  })

  it('serializes an account switch without returning the previous user run', async () => {
    let finishFirstPull: (() => void) | undefined
    let pullCount = 0
    const usersSeen: string[] = []
    const local = {
      getBootstrapState: vi.fn(async (userId: string) => {
        usersSeen.push(userId)
        return 'bootstrapped'
      }),
      getDeviceState: vi.fn(async (userId: string) => ({
        id: `${userId}:${DEVICE}`,
        userId,
        deviceId: DEVICE,
        lastCommitOrder: 0,
        lastPulledRevision: 0,
        updatedAt: NOW,
      })),
      recoverInFlight: vi.fn(async () => 0),
      getPullCursor: vi.fn(async () => 0),
      applyRemotePage: vi.fn(),
      listPendingMutations: vi.fn(async () => []),
      getQueueCounts: vi.fn(async () => ({
        pending: 0,
        conflicts: 0,
        failedPermanent: 0,
      })),
      listConflictViews: vi.fn(async () => []),
    } as unknown as SyncRepository
    const switchedCloud = {
      pullRemotePage: vi.fn(async () => {
        pullCount += 1
        if (pullCount === 1) {
          await new Promise<void>((resolve) => {
            finishFirstPull = resolve
          })
        }
        return { changes: [], highWatermark: 0 }
      }),
    } as unknown as CloudSyncPort
    const switchingLock = new ImmediateLock()
    const switching = new SyncEngine(
      local,
      switchedCloud,
      switchingLock,
      status,
      DEVICE,
      { now: () => NOW, online: () => true },
    )

    const first = switching.sync({ kind: 'authenticated', userId: USER })
    await vi.waitFor(() => expect(finishFirstPull).toBeTypeOf('function'))
    const second = switching.sync({ kind: 'authenticated', userId: USER_B })
    expect(usersSeen).toEqual([USER])
    finishFirstPull?.()

    await expect(first).resolves.toMatchObject({ state: { status: 'idle' } })
    await expect(second).resolves.toMatchObject({ state: { status: 'idle' } })
    expect(usersSeen).toEqual([USER, USER_B])
    expect(switchingLock.calls).toBe(2)
  })

  it('keeps the Outbox pending while offline and resumes without changing mutation identity', async () => {
    await seedAndMutate()
    const offlineEngine = new SyncEngine(
      repository,
      cloud,
      lock,
      status,
      DEVICE,
      { online: () => false, now: () => NOW },
    )

    await expect(
      offlineEngine.sync({ kind: 'authenticated', userId: USER }),
    ).resolves.toMatchObject({ state: { status: 'offline' } })
    await expect(
      database.local_mutations.get(MUTATION_A),
    ).resolves.toMatchObject({ mutationId: MUTATION_A, status: 'pending' })
    expect(cloud.submitMutation).not.toHaveBeenCalled()
  })

  it('does not retry a permanent rejection and blocks causal successors', async () => {
    await seedAndMutate()
    cloud.submitFailures.push(
      new CloudPortError('apply_sync_mutation_v1', 'MutationIdReuse'),
    )

    const result = await engine.sync({ kind: 'authenticated', userId: USER })

    expect(result.state.status).toBe('blocked')
    expect(cloud.submitMutation).toHaveBeenCalledTimes(1)
    await expect(
      database.local_mutations.get(MUTATION_A),
    ).resolves.toMatchObject({ status: 'failed_permanent' })
    await expect(
      database.local_mutations.get(MUTATION_B),
    ).resolves.toMatchObject({
      status: 'pending',
      changes: [expect.objectContaining({ predecessorMutationId: MUTATION_A })],
    })
  })
})
