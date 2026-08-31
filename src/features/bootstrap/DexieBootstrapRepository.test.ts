import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  createCompleteBackupData,
  fixtureIds,
} from '@/features/backup/testFixtures'
import type { BackupData } from '@/features/backup/format'
import type { CloudBootstrapSnapshot } from './model'
import { DexieBootstrapRepository } from './DexieBootstrapRepository'

const AUTH_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const BOOTSTRAP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = '2026-08-31T08:00:00.000Z'

async function seed(database: DailyWorkDatabase, data: BackupData) {
  await database.tasks.bulkPut(data.tasks)
  await database.confirmations.bulkPut(data.waiting)
  await database.memos.bulkPut(data.memos)
  await database.routines.bulkPut(data.routines)
  await database.routine_logs.bulkPut(data.routineLogs)
  await database.activities.bulkPut(data.activities)
  await database.daily_logs.bulkPut(data.dailyLogs)
}

function cloudSnapshot(ownerId = AUTH_USER): CloudBootstrapSnapshot {
  const data = createCompleteBackupData(ownerId)
  const entities = [
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
  ]
  return {
    ownerId,
    highWatermark: entities.length,
    capturedAt: NOW,
    entries: entities.map((entry, index) => ({
      ...entry,
      entityId: entry.entitySnapshot.id,
      serverRevision: index + 1,
      serverVersion: 1,
      mutationId: BOOTSTRAP,
      deviceId: DEVICE,
      occurredAt: NOW,
    })),
  }
}

let sequence = 0

describe('DexieBootstrapRepository', () => {
  let database: DailyWorkDatabase
  let name: string

  beforeEach(async () => {
    name = `bootstrap-local-${++sequence}`
    database = new DailyWorkDatabase(name)
    await database.open()
  })

  afterEach(async () => {
    database.close()
    await Dexie.delete(name)
  })

  it('migrates ownership atomically without changing entity history or device identity', async () => {
    const original = createCompleteBackupData()
    await seed(database, original)
    const repository = new DexieBootstrapRepository(database)

    await repository.migrateOwnership(
      'local-user',
      AUTH_USER,
      BOOTSTRAP,
      DEVICE,
      NOW,
    )

    const migrated = await repository.readData(AUTH_USER)
    expect(migrated.tasks.map(({ id, version }) => ({ id, version }))).toEqual(
      original.tasks.map(({ id, version }) => ({ id, version })),
    )
    expect(migrated.dailyLogs[0]?.snapshot).toEqual(
      original.dailyLogs[0]?.snapshot,
    )
    expect(migrated.activities[0]?.payload).toEqual(
      original.activities[0]?.payload,
    )
    expect(await repository.hasData('local-user')).toBe(false)
    expect(await repository.getProgress(AUTH_USER)).toMatchObject({
      bootstrapId: BOOTSTRAP,
      deviceId: DEVICE,
      stage: 'ownership_migrated',
    })
  })

  it('rolls back a pre-commit ownership migration exactly from its checkpoint', async () => {
    const original = createCompleteBackupData()
    await seed(database, original)
    const repository = new DexieBootstrapRepository(database)
    await repository.migrateOwnership(
      'local-user',
      AUTH_USER,
      BOOTSTRAP,
      DEVICE,
      NOW,
    )

    await repository.rollbackOwnership(AUTH_USER, NOW)

    await expect(repository.readData('local-user')).resolves.toEqual(original)
    expect(await repository.hasData(AUTH_USER)).toBe(false)
    expect(await repository.getProgress(AUTH_USER)).toBeNull()
  })

  it('rolls back every ownership write when migration fails', async () => {
    const original = createCompleteBackupData()
    await seed(database, original)
    const repository = new DexieBootstrapRepository(database, {
      failOwnershipMigration: true,
    })

    await expect(
      repository.migrateOwnership(
        'local-user',
        AUTH_USER,
        BOOTSTRAP,
        DEVICE,
        NOW,
      ),
    ).rejects.toThrow('Injected')

    await expect(repository.readData('local-user')).resolves.toEqual(original)
    expect(await repository.hasData(AUTH_USER)).toBe(false)
    await expect(database.ownership_checkpoints.count()).resolves.toBe(0)
  })

  it('initializes per-entity server metadata and no fake Outbox', async () => {
    await seed(database, createCompleteBackupData())
    const repository = new DexieBootstrapRepository(database)
    await repository.migrateOwnership(
      'local-user',
      AUTH_USER,
      BOOTSTRAP,
      DEVICE,
      NOW,
    )
    const snapshot = cloudSnapshot()
    await repository.updateProgress(AUTH_USER, {
      stage: 'server_committed',
      updatedAt: NOW,
    })

    await repository.finalizeUploadedWorkspace(
      AUTH_USER,
      DEVICE,
      snapshot.entries.map((entry) => ({
        entityType: entry.entityType,
        entityId: entry.entityId,
        serverRevision: entry.serverRevision,
        serverVersion: entry.serverVersion,
      })),
      snapshot.highWatermark,
      NOW,
    )

    await expect(database.local_mutations.count()).resolves.toBe(0)
    await expect(database.local_changes.count()).resolves.toBe(0)
    await expect(database.sync_metadata.count()).resolves.toBe(
      snapshot.entries.length,
    )
    await expect(
      database.sync_metadata.get(`${AUTH_USER}:task:${fixtureIds.task}`),
    ).resolves.toMatchObject({ serverRevision: 1, localVersion: 1 })
    await expect(database.sync_bootstrap.get(AUTH_USER)).resolves.toMatchObject(
      {
        state: 'bootstrapped',
      },
    )
    expect(await repository.getProgress(AUTH_USER)).toBeNull()
  })

  it('atomically replaces local data with cloud data and preserves other owners', async () => {
    const local = createCompleteBackupData()
    await seed(database, local)
    const other = createCompleteBackupData('other-user')
    other.tasks = other.tasks.map((task) => ({
      ...task,
      id: `${task.id}-other`,
    }))
    await database.tasks.bulkPut(other.tasks)
    const snapshot = cloudSnapshot()
    const repository = new DexieBootstrapRepository(database)
    await repository.beginCloudRestore(
      'local-user',
      AUTH_USER,
      BOOTSTRAP,
      DEVICE,
      'use_cloud',
      NOW,
    )

    await repository.replaceWithCloud(
      'local-user',
      AUTH_USER,
      DEVICE,
      snapshot,
      NOW,
    )

    await expect(repository.readData(AUTH_USER)).resolves.toEqual(
      createCompleteBackupData(AUTH_USER),
    )
    expect(await repository.hasData('local-user')).toBe(false)
    await expect(database.tasks.get(other.tasks[0]!.id)).resolves.toBeDefined()
  })

  it('leaves current local data untouched if cloud replacement fails', async () => {
    const original = createCompleteBackupData()
    await seed(database, original)
    const repository = new DexieBootstrapRepository(database, {
      failCloudReplace: true,
    })
    await repository.beginCloudRestore(
      'local-user',
      AUTH_USER,
      BOOTSTRAP,
      DEVICE,
      'use_cloud',
      NOW,
    )

    await expect(
      repository.replaceWithCloud(
        'local-user',
        AUTH_USER,
        DEVICE,
        cloudSnapshot(),
        NOW,
      ),
    ).rejects.toThrow('Injected')

    await expect(repository.readData('local-user')).resolves.toEqual(original)
    expect(await repository.hasData(AUTH_USER)).toBe(false)
  })
})
