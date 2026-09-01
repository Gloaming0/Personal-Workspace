import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { createTask } from '@/domain/task'
import { FixedDeviceIdentity } from '@/sync/DeviceIdentityStore'
import type {
  LocalMutationRecord,
  PersistedSyncConflict,
  RemoteEntityChange,
} from '@/sync/contracts'
import { syncDeviceStateId, syncMetadataId } from '@/sync/journal'
import { ConflictResolutionService } from './ConflictResolutionService'
import { DexieConflictResolutionRepository } from './DexieConflictResolutionRepository'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const REMOTE_DEVICE = '00000000-0000-4000-8000-0000000000d2'
const TASK_ID = '00000000-0000-4000-8000-0000000000b1'
const MUTATION = '00000000-0000-4000-8000-0000000000a1'
const REPLACEMENT = '00000000-0000-4000-8000-0000000000a2'
const RESOLUTION = '00000000-0000-4000-8000-0000000000c1'
const NOW = '2026-09-01T08:00:00.000Z'
const LATER = '2026-09-01T09:00:00.000Z'
let sequence = 0
const databases: DailyWorkDatabase[] = []

function setup() {
  const database = new DailyWorkDatabase(`conflict-resolution-${++sequence}`)
  databases.push(database)
  const repository = new DexieConflictResolutionRepository(database, {
    deviceIdentity: new FixedDeviceIdentity(DEVICE),
    now: () => LATER,
  })
  return { database, service: new ConflictResolutionService(repository) }
}

async function seed(database: DailyWorkDatabase) {
  await database.open()
  const base = createTask(
    { userId: USER, title: 'Base', plannedDate: '2026-09-01' },
    { id: TASK_ID, now: NOW },
  )
  const local = { ...base, title: 'Local', version: 2, updatedAt: LATER }
  const remote = { ...base, title: 'Remote', version: 2, updatedAt: LATER }
  await database.tasks.put(local)
  const mutation: LocalMutationRecord = {
    mutationId: MUTATION,
    userId: USER,
    deviceId: DEVICE,
    commitOrder: 1,
    occurredAt: LATER,
    entityKeys: [`task:${TASK_ID}`],
    changes: [
      {
        sequence: 1,
        entityType: 'task',
        entityId: TASK_ID,
        operation: 'update',
        baseServerRevision: 1,
        baseLocalVersion: 1,
        resultingLocalVersion: 2,
        predecessorMutationId: null,
        entitySnapshot: local,
      },
    ],
    status: 'conflicted',
    acknowledgedAt: null,
    entityResults: [],
    failureCode: null,
  }
  const remoteChange: RemoteEntityChange = {
    userId: USER,
    entityType: 'task',
    entity: remote,
    operation: 'update',
    baseServerRevision: 1,
    serverRevision: 2,
    serverVersion: 2,
    mutationId: '00000000-0000-4000-8000-0000000000a9',
    deviceId: REMOTE_DEVICE,
    occurredAt: LATER,
  }
  const conflict: PersistedSyncConflict = {
    id: 'conflict-1',
    userId: USER,
    mutationId: MUTATION,
    entityType: 'task',
    entityId: TASK_ID,
    conflict: {
      type: 'SameBaseConcurrentEdit',
      entityType: 'task',
      entityId: TASK_ID,
    },
    remoteChange,
    status: 'open',
    createdAt: LATER,
    resolvedAt: null,
    resolutionId: null,
    resolutionAction: null,
  }
  await database.local_mutations.put(mutation)
  await database.sync_conflicts.put(conflict)
  await database.sync_metadata.put({
    id: syncMetadataId(USER, 'task', TASK_ID),
    userId: USER,
    entityType: 'task',
    entityId: TASK_ID,
    localVersion: 2,
    baseServerRevision: 1,
    serverRevision: 1,
    serverVersion: 1,
    lastMutationId: MUTATION,
    lastAcknowledgedMutationId: null,
    lastModifiedByDeviceId: DEVICE,
    updatedAt: LATER,
  })
  await database.sync_device_state.put({
    id: syncDeviceStateId(USER, DEVICE),
    userId: USER,
    deviceId: DEVICE,
    lastCommitOrder: 1,
    lastPulledRevision: 2,
    updatedAt: LATER,
  })
}

afterEach(async () => {
  const names = databases.map((database) => database.name)
  databases.splice(0).forEach((database) => database.close())
  await Promise.all(names.map((name) => Dexie.delete(name)))
})

describe('ConflictResolutionService', () => {
  it('keeps mine by atomically superseding the conflict and creating a rebased mutation', async () => {
    const { database, service } = setup()
    await seed(database)
    const command = {
      resolutionId: RESOLUTION,
      mutationId: REPLACEMENT,
      userId: USER,
      conflictId: 'conflict-1',
      action: 'keep_mine' as const,
    }
    await expect(service.resolve(command)).resolves.toMatchObject({
      mutationId: REPLACEMENT,
      createdMutation: true,
    })
    await expect(service.resolve(command)).resolves.toMatchObject({
      mutationId: REPLACEMENT,
    })
    await expect(database.local_mutations.get(MUTATION)).resolves.toMatchObject(
      {
        status: 'superseded',
      },
    )
    await expect(
      database.local_mutations.get(REPLACEMENT),
    ).resolves.toMatchObject({
      commitOrder: 2,
      status: 'pending',
      changes: [{ baseServerRevision: 2, entitySnapshot: { title: 'Local' } }],
    })
    await expect(database.conflict_resolutions.count()).resolves.toBe(1)
  })

  it('uses remote without generating Activity or Outbox and is user isolated', async () => {
    const { database, service } = setup()
    await seed(database)
    await expect(
      service.resolve({
        resolutionId: RESOLUTION,
        mutationId: null,
        userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        conflictId: 'conflict-1',
        action: 'use_remote',
      }),
    ).rejects.toThrow('ConflictNotFound')
    await service.resolve({
      resolutionId: RESOLUTION,
      mutationId: null,
      userId: USER,
      conflictId: 'conflict-1',
      action: 'use_remote',
    })
    await expect(database.tasks.get(TASK_ID)).resolves.toMatchObject({
      title: 'Remote',
    })
    await expect(database.activities.count()).resolves.toBe(0)
    await expect(database.local_mutations.count()).resolves.toBe(1)
    await expect(
      database.sync_conflicts.get('conflict-1'),
    ).resolves.toMatchObject({
      status: 'resolved',
      resolutionId: RESOLUTION,
    })
  })
})
