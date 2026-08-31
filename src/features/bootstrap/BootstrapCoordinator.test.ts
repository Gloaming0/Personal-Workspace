import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudSyncPort } from '@/cloud/contracts'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { BackupService } from '@/features/backup/BackupService'
import { DexieBackupRepository } from '@/features/backup/DexieBackupRepository'
import { createCompleteBackupData } from '@/features/backup/testFixtures'
import { FixedDeviceIdentity } from '@/sync/DeviceIdentityStore'
import type { BootstrapChunkRequest } from '@/cloud/contracts'
import type { BootstrapCommitResult, CloudBootstrapSnapshot } from './model'
import { BootstrapCoordinator } from './BootstrapCoordinator'
import { DexieBootstrapRepository } from './DexieBootstrapRepository'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BOOTSTRAP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = '2026-08-31T08:00:00.000Z'

function cloudSnapshot(): CloudBootstrapSnapshot {
  const data = createCompleteBackupData(USER)
  const entries = [
    ...data.tasks.map((entitySnapshot) => ({
      entityType: 'task' as const,
      entitySnapshot,
    })),
    ...data.waiting.map((entitySnapshot) => ({
      entityType: 'waiting' as const,
      entitySnapshot,
    })),
    ...data.memos.map((entitySnapshot) => ({
      entityType: 'memo' as const,
      entitySnapshot,
    })),
    ...data.routines.map((entitySnapshot) => ({
      entityType: 'routine' as const,
      entitySnapshot,
    })),
    ...data.routineLogs.map((entitySnapshot) => ({
      entityType: 'routine_log' as const,
      entitySnapshot,
    })),
    ...data.activities.map((entitySnapshot) => ({
      entityType: 'activity' as const,
      entitySnapshot,
    })),
    ...data.dailyLogs.map((entitySnapshot) => ({
      entityType: 'daily_log' as const,
      entitySnapshot,
    })),
  ].map((entry, index) => ({
    ...entry,
    entityId: entry.entitySnapshot.id,
    serverRevision: index + 1,
    serverVersion: 1,
    mutationId: BOOTSTRAP,
    deviceId: DEVICE,
    occurredAt: NOW,
  }))
  return {
    ownerId: USER,
    highWatermark: entries.length,
    capturedAt: NOW,
    entries,
  }
}

class MemoryCloud implements CloudSyncPort {
  hasData = false
  highWatermark = 0
  uploaded = new Map<number, BootstrapChunkRequest>()
  failChunkOnce: number | null = null
  loseCommitAckOnce = false
  committed: BootstrapCommitResult | null = null
  snapshot = cloudSnapshot()

  inspectCloudWorkspace = async () => ({
    hasData: this.hasData,
    highWatermark: this.highWatermark,
  })
  getRemoteHighWatermark = async () => this.highWatermark
  pullRemotePage = async () => ({
    changes: [],
    highWatermark: this.highWatermark,
  })
  submitMutation = vi.fn()
  queryMutationResult = vi.fn()
  beginBootstrap = vi.fn(async (request: { bootstrapId: string }) => ({
    bootstrapId: request.bootstrapId,
    status: (this.committed ? 'committed' : 'staging') as
      'committed' | 'staging',
  }))
  uploadBootstrapChunk = vi.fn(async (request: BootstrapChunkRequest) => {
    const existing = this.uploaded.get(request.chunkIndex)
    if (existing && JSON.stringify(existing) !== JSON.stringify(request)) {
      throw new Error('BootstrapChunkReuse')
    }
    if (this.failChunkOnce === request.chunkIndex) {
      this.failChunkOnce = null
      throw new Error('offline')
    }
    this.uploaded.set(request.chunkIndex, structuredClone(request))
  })
  commitBootstrap = vi.fn(async (bootstrapId: string) => {
    if (!this.committed) {
      const changes = [...this.uploaded.values()].flatMap(
        (chunk) => chunk.payload.changes as Array<Record<string, unknown>>,
      )
      this.committed = {
        bootstrapId,
        status: 'committed',
        entityCount: changes.length,
        highWatermark: changes.length,
        entityResults: changes.map((change, index) => ({
          entityType: change.entityType as never,
          entityId: String(change.entityId),
          serverRevision: index + 1,
          serverVersion: 1,
        })),
      }
    }
    if (this.loseCommitAckOnce) {
      this.loseCommitAckOnce = false
      throw new Error('timeout')
    }
    return structuredClone(this.committed)
  })
  downloadBootstrapSnapshot = async () => structuredClone(this.snapshot)
}

async function seed(database: DailyWorkDatabase) {
  const data = createCompleteBackupData()
  await database.tasks.bulkPut(data.tasks)
  await database.confirmations.bulkPut(data.waiting)
  await database.memos.bulkPut(data.memos)
  await database.routines.bulkPut(data.routines)
  await database.routine_logs.bulkPut(data.routineLogs)
  await database.activities.bulkPut(data.activities)
  await database.daily_logs.bulkPut(data.dailyLogs)
}

let sequence = 0
describe('BootstrapCoordinator', () => {
  let database: DailyWorkDatabase
  let repository: DexieBootstrapRepository
  let cloud: MemoryCloud
  let coordinator: BootstrapCoordinator
  let name: string
  const safety = { save: vi.fn(async () => undefined) }

  beforeEach(async () => {
    name = `bootstrap-coordinator-${++sequence}`
    database = new DailyWorkDatabase(name)
    await database.open()
    repository = new DexieBootstrapRepository(database)
    cloud = new MemoryCloud()
    safety.save.mockClear()
    coordinator = new BootstrapCoordinator(
      repository,
      cloud,
      new BackupService(new DexieBackupRepository(database), {
        now: () => NOW,
      }),
      new FixedDeviceIdentity(DEVICE),
      {
        now: () => NOW,
        createId: () => BOOTSTRAP,
        chunkSize: 2,
        digest: async (value) =>
          [...value].reduce(
            (hash, character) =>
              `${hash}${character.charCodeAt(0).toString(16)}`.slice(-64),
            '0'.repeat(64),
          ),
      },
    )
  })

  afterEach(async () => {
    database.close()
    await Dexie.delete(name)
  })

  it('initializes empty local and cloud workspaces without an Outbox', async () => {
    await expect(coordinator.inspect(USER)).resolves.toMatchObject({
      decision: 'initialize_authenticated_workspace',
    })
    await coordinator.initializeEmpty(USER)
    await expect(database.sync_bootstrap.get(USER)).resolves.toMatchObject({
      state: 'bootstrapped',
    })
    await expect(database.local_mutations.count()).resolves.toBe(0)
    await expect(coordinator.inspect(USER)).resolves.toMatchObject({
      decision: 'already_bootstrapped',
      syncBootstrapState: 'bootstrapped',
    })
  })

  it('uploads authoritative local data, tombstones and history in deterministic chunks', async () => {
    await seed(database)
    await coordinator.connectLocalData(USER, 'UTC', safety)

    expect(safety.save).toHaveBeenCalledOnce()
    expect(cloud.uploaded.size).toBeGreaterThan(1)
    const uploaded = [...cloud.uploaded.values()].flatMap(
      (chunk) => chunk.payload.changes as Array<Record<string, unknown>>,
    )
    expect(
      uploaded.some(
        (change) =>
          (change.entitySnapshot as { deletedAt: string | null }).deletedAt !==
          null,
      ),
    ).toBe(true)
    await expect(repository.hasData(USER)).resolves.toBe(true)
    await expect(repository.hasData('local-user')).resolves.toBe(false)
    await expect(database.sync_metadata.count()).resolves.toBe(uploaded.length)
    await expect(database.local_mutations.count()).resolves.toBe(0)
  })

  it('resumes at a failed chunk and reuses the same bootstrap identity', async () => {
    await seed(database)
    cloud.failChunkOnce = 1
    await expect(
      coordinator.connectLocalData(USER, 'UTC', safety),
    ).rejects.toThrow('offline')
    await expect(repository.getProgress(USER)).resolves.toMatchObject({
      bootstrapId: BOOTSTRAP,
      nextChunkIndex: 1,
    })

    await coordinator.resume(USER)

    expect(cloud.beginBootstrap).toHaveBeenCalledTimes(2)
    await expect(repository.getProgress(USER)).resolves.toBeNull()
  })

  it('retries the same committed bootstrap after a lost final acknowledgement', async () => {
    await seed(database)
    cloud.loseCommitAckOnce = true
    await expect(
      coordinator.connectLocalData(USER, 'UTC', safety),
    ).rejects.toThrow('timeout')
    expect(cloud.committed).not.toBeNull()
    await expect(coordinator.cancel(USER)).rejects.toThrow('rollback boundary')
    await expect(repository.hasData(USER)).resolves.toBe(true)

    await coordinator.resume(USER)

    expect(cloud.commitBootstrap).toHaveBeenCalledTimes(2)
    await expect(database.sync_bootstrap.get(USER)).resolves.toMatchObject({
      state: 'bootstrapped',
    })
  })

  it('restores an existing cloud workspace atomically without creating activity or Outbox', async () => {
    cloud.hasData = true
    cloud.highWatermark = cloud.snapshot.highWatermark
    await expect(coordinator.inspect(USER)).resolves.toMatchObject({
      decision: 'restore_cloud_data',
    })

    await coordinator.restoreCloud(USER)

    await expect(repository.readData(USER)).resolves.toEqual(
      createCompleteBackupData(USER),
    )
    await expect(database.activities.count()).resolves.toBe(1)
    await expect(database.local_mutations.count()).resolves.toBe(0)
    await expect(
      database.sync_device_state.get(`${USER}:${DEVICE}`),
    ).resolves.toMatchObject({ lastPulledRevision: cloud.highWatermark })
  })

  it('blocks local plus cloud data until Use Cloud and safety confirmation', async () => {
    await seed(database)
    cloud.hasData = true
    cloud.highWatermark = cloud.snapshot.highWatermark
    await expect(coordinator.inspect(USER)).resolves.toMatchObject({
      decision: 'manual_choice_required',
    })
    expect(await repository.readData('local-user')).toEqual(
      createCompleteBackupData(),
    )

    await coordinator.useCloud(USER, 'UTC', safety)

    expect(safety.save).toHaveBeenCalledOnce()
    await expect(repository.readData(USER)).resolves.toEqual(
      createCompleteBackupData(USER),
    )
  })

  it('backs up authenticated local data before replacing it with cloud data', async () => {
    const authenticatedData = createCompleteBackupData(USER)
    await database.tasks.bulkPut(authenticatedData.tasks)
    await database.confirmations.bulkPut(authenticatedData.waiting)
    await database.memos.bulkPut(authenticatedData.memos)
    await database.routines.bulkPut(authenticatedData.routines)
    await database.routine_logs.bulkPut(authenticatedData.routineLogs)
    await database.activities.bulkPut(authenticatedData.activities)
    await database.daily_logs.bulkPut(authenticatedData.dailyLogs)
    cloud.hasData = true
    cloud.highWatermark = cloud.snapshot.highWatermark

    await coordinator.useCloud(USER, 'UTC', safety)

    expect(safety.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ userId: USER }),
      }),
      expect.any(String),
    )
    await expect(repository.readData(USER)).resolves.toEqual(
      createCompleteBackupData(USER),
    )
  })

  it('blocks destructive bootstrap when the safety backup fails', async () => {
    await seed(database)
    await expect(
      coordinator.connectLocalData(USER, 'UTC', {
        save: async () => {
          throw new Error('download blocked')
        },
      }),
    ).rejects.toThrow('download blocked')

    await expect(repository.readData('local-user')).resolves.toEqual(
      createCompleteBackupData(),
    )
    await expect(repository.getProgress(USER)).resolves.toBeNull()
  })
})
