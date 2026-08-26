import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createRoutineLog } from '@/domain/routineLog'
import { createTask, setTaskFocus, softDeleteTask } from '@/domain/task'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { ActivityService } from '@/features/activity/ActivityService'
import { BackupService } from '@/features/backup/BackupService'
import { DexieBackupRepository } from '@/features/backup/DexieBackupRepository'
import { createCompleteBackupData } from '@/features/backup/testFixtures'
import { TaskService } from '@/features/tasks/TaskService'
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { DexieUnitOfWork } from '@/unitOfWork/dexie/DexieUnitOfWork'
import { DeviceIdentityStore, FixedDeviceIdentity } from './DeviceIdentityStore'
import { executeMutation } from './MutationCommandExecutor'
import { detectConcurrentMutationConflict } from './conflicts'
import { DexieSyncRepository } from './dexie/DexieSyncRepository'
import { MutationAlreadyAppliedError, SyncConflictError } from './contracts'

const USER = 'local-user'
const OTHER_USER = 'other-user'
const NOW = '2026-08-26T08:00:00.000Z'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const MUTATION = '00000000-0000-4000-8000-0000000000a1'
const TASK_ID = '00000000-0000-4000-8000-0000000000b1'
const ACTIVITY_ID = '00000000-0000-4000-8000-0000000000c1'

let sequence = 0
const databases: DailyWorkDatabase[] = []

function database() {
  const value = new DailyWorkDatabase(`sync-readiness-${++sequence}`)
  databases.push(value)
  return value
}

function unitOfWork(value: DailyWorkDatabase) {
  let idSequence = 0
  return new DexieUnitOfWork(value, undefined, {
    deviceIdentity: new FixedDeviceIdentity(DEVICE),
    createId: () =>
      `00000000-0000-4000-8000-${String(++idSequence).padStart(12, '0')}`,
    now: () => NOW,
  })
}

afterEach(async () => {
  const names = databases.map((value) => value.name)
  databases.splice(0).forEach((value) => value.close())
  await Promise.all(names.map((name) => Dexie.delete(name)))
  localStorage.clear()
})

describe('sync readiness foundation', () => {
  it('keeps one stable device UUID outside business backup data', async () => {
    const storage = new Map<string, string>()
    const browserStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }
    const first = new DeviceIdentityStore({
      storage: browserStorage,
      createId: () => DEVICE,
    })
    const second = new DeviceIdentityStore({
      storage: browserStorage,
      createId: () => '00000000-0000-4000-8000-0000000000d2',
    })
    expect(first.getDeviceId()).toBe(DEVICE)
    expect(second.getDeviceId()).toBe(DEVICE)
    storage.set('daily-work-os:device-id:v1', 'corrupt-device-id')
    expect(second.getDeviceId()).toBe('00000000-0000-4000-8000-0000000000d2')

    const value = database()
    const backup = await new BackupService(new DexieBackupRepository(value), {
      now: () => NOW,
      appVersion: 'test',
    }).createBackup(USER, 'UTC')
    expect(Object.keys(JSON.parse(backup.json).data)).toEqual([
      'tasks',
      'waiting',
      'memos',
      'routines',
      'routineLogs',
      'activities',
      'dailyLogs',
    ])
    expect(backup.json).not.toContain(DEVICE)
  })

  it('commits Entity, Activity, SyncMetadata, and LocalChange atomically', async () => {
    const value = database()
    await value.open()
    const task = createTask(
      { userId: USER, title: 'Atomic mutation', plannedDate: '2026-08-26' },
      { id: TASK_ID, now: NOW },
    )
    await value.tasks.add(task)
    const tasks = new DexieTaskRepository(value)
    const activities = new DexieActivityRepository(value)
    const work = unitOfWork(value)
    const service = new TaskService(
      tasks,
      work,
      { now: () => NOW },
      new ActivityService(activities, {
        createId: () => ACTIVITY_ID,
        now: () => NOW,
      }),
    )

    await executeMutation(
      work,
      { mutationId: MUTATION, userId: USER, occurredAt: NOW },
      ['tasks', 'activities'],
      (transaction) => service.complete(USER, TASK_ID, transaction),
    )

    const sync = new DexieSyncRepository(value)
    const changes = await sync.listPendingChanges(USER)
    expect(changes).toHaveLength(2)
    expect(changes.map((change) => change.entityType)).toEqual([
      'task',
      'activity',
    ])
    expect(changes.every((change) => change.mutationId === MUTATION)).toBe(true)
    expect(changes[0]).toMatchObject({
      operation: 'update',
      baseVersion: 1,
      resultingVersion: 2,
      deviceId: DEVICE,
    })
    await expect(activities.find(USER, {})).resolves.toEqual([
      expect.objectContaining({ deviceId: DEVICE }),
    ])
    await expect(
      sync.getSyncMetadata(USER, 'task', TASK_ID),
    ).resolves.toMatchObject({
      localVersion: 2,
      serverRevision: null,
      lastMutationId: MUTATION,
      lastModifiedByDeviceId: DEVICE,
    })
    await expect(sync.listPendingChanges(OTHER_USER)).resolves.toEqual([])
    await sync.markMutationAcknowledged(
      USER,
      MUTATION,
      11,
      '2026-08-26T09:00:00.000Z',
    )
    await expect(sync.listPendingChanges(USER)).resolves.toEqual([])
    await expect(
      sync.getSyncMetadata(USER, 'task', TASK_ID),
    ).resolves.toMatchObject({
      baseServerRevision: 11,
      serverRevision: 11,
    })
  })

  it('rolls back Entity and leaves no LocalChange when Activity append fails', async () => {
    const value = database()
    await value.open()
    const task = createTask(
      { userId: USER, title: 'Rollback', plannedDate: '2026-08-26' },
      { id: TASK_ID, now: NOW },
    )
    await value.tasks.add(task)
    class FailingActivityRepository extends DexieActivityRepository {
      override async append(): Promise<void> {
        throw new Error('Injected Activity failure')
      }
    }
    const tasks = new DexieTaskRepository(value)
    const activities = new DexieActivityRepository(value)
    const work = new DexieUnitOfWork(
      value,
      (transaction) => ({
        activities: new FailingActivityRepository(
          value,
          transaction.table('activities') as typeof value.activities,
        ),
      }),
      { deviceIdentity: new FixedDeviceIdentity(DEVICE) },
    )
    const service = new TaskService(
      tasks,
      work,
      { now: () => NOW },
      new ActivityService(activities),
    )

    await expect(
      executeMutation(
        work,
        { mutationId: MUTATION, userId: USER },
        ['tasks', 'activities'],
        (transaction) => service.complete(USER, TASK_ID, transaction),
      ),
    ).rejects.toThrow('Injected Activity failure')
    await expect(tasks.getById(USER, TASK_ID)).resolves.toMatchObject({
      status: 'todo',
      version: 1,
    })
    await expect(value.local_changes.count()).resolves.toBe(0)
    await expect(value.sync_metadata.count()).resolves.toBe(0)
  })

  it('rejects a replayed mutationId without duplicating Entity, Activity, or journal rows', async () => {
    const value = database()
    await value.open()
    await value.tasks.add(
      createTask(
        { userId: USER, title: 'Replay', plannedDate: '2026-08-26' },
        { id: TASK_ID, now: NOW },
      ),
    )
    const tasks = new DexieTaskRepository(value)
    const activities = new DexieActivityRepository(value)
    const work = unitOfWork(value)
    let activitySequence = 0
    const service = new TaskService(
      tasks,
      work,
      { now: () => NOW },
      new ActivityService(activities, {
        createId: () =>
          `00000000-0000-4000-8000-${String(++activitySequence + 500).padStart(12, '0')}`,
        now: () => NOW,
      }),
    )
    const intent = { mutationId: MUTATION, userId: USER }
    await executeMutation(
      work,
      intent,
      ['tasks', 'activities'],
      (transaction) => service.complete(USER, TASK_ID, transaction),
    )
    await expect(
      executeMutation(work, intent, ['tasks', 'activities'], (transaction) =>
        service.reopen(USER, TASK_ID, transaction),
      ),
    ).rejects.toBeInstanceOf(MutationAlreadyAppliedError)

    await expect(tasks.getById(USER, TASK_ID)).resolves.toMatchObject({
      status: 'done',
      version: 2,
    })
    await expect(activities.find(USER, {})).resolves.toHaveLength(1)
    await expect(value.local_changes.count()).resolves.toBe(2)
  })

  it('enumerates user-owned tombstones and reads deleted entities through sync ports', async () => {
    const value = database()
    await value.open()
    const deleted = softDeleteTask(
      createTask(
        { userId: USER, title: 'Deleted', plannedDate: '2026-08-26' },
        { id: TASK_ID, now: NOW },
      ),
      '2026-08-26T09:00:00.000Z',
    )
    const other = softDeleteTask(
      createTask(
        { userId: OTHER_USER, title: 'Private', plannedDate: '2026-08-26' },
        { id: '00000000-0000-4000-8000-0000000000b2', now: NOW },
      ),
      '2026-08-26T09:00:00.000Z',
    )
    await value.tasks.bulkAdd([deleted, other])
    const sync = new DexieSyncRepository(value)

    await expect(sync.listTombstones(USER, 'task')).resolves.toEqual([
      { entityType: 'task', entity: deleted },
    ])
    await expect(
      sync.getEntityIncludingDeleted(USER, 'task', TASK_ID),
    ).resolves.toEqual(deleted)
    await expect(
      sync.getEntityIncludingDeleted(OTHER_USER, 'task', TASK_ID),
    ).resolves.toBeNull()
  })

  it('recognizes two different mutations from the same base as a conflict', () => {
    const base = {
      id: 'change-a',
      mutationId: MUTATION,
      deviceId: DEVICE,
      userId: USER,
      occurredAt: NOW,
      sequence: 1,
      entityType: 'task' as const,
      entityId: TASK_ID,
      operation: 'update' as const,
      baseVersion: 2,
      resultingVersion: 3,
      baseServerRevision: null,
      status: 'pending' as const,
      acknowledgedAt: null,
    }
    expect(
      detectConcurrentMutationConflict(base, {
        ...base,
        id: 'change-b',
        mutationId: '00000000-0000-4000-8000-0000000000a2',
      }),
    ).toEqual({
      type: 'SameBaseConcurrentEdit',
      entityType: 'task',
      entityId: TASK_ID,
    })
  })

  it('rejects remote Focus, RoutineLog, and DailyLog unique-invariant violations', async () => {
    const value = database()
    await value.open()
    const focused = [1, 2, 3].map((order) =>
      setTaskFocus(
        createTask(
          { userId: USER, title: `Focus ${order}`, plannedDate: '2026-08-26' },
          {
            id: `00000000-0000-4000-8000-${String(order + 700).padStart(12, '0')}`,
            now: NOW,
          },
        ),
        '2026-08-26',
        order as 1 | 2 | 3,
        '2026-08-26T08:01:00.000Z',
      ),
    )
    await value.tasks.bulkAdd(focused)
    const incoming = setTaskFocus(
      createTask(
        { userId: USER, title: 'Fourth', plannedDate: '2026-08-26' },
        { id: TASK_ID, now: NOW },
      ),
      '2026-08-26',
      1,
      '2026-08-26T08:01:00.000Z',
    )
    const sync = new DexieSyncRepository(value)
    const remote = {
      userId: USER,
      baseServerRevision: null,
      serverRevision: 1,
      mutationId: MUTATION,
      deviceId: DEVICE,
      occurredAt: NOW,
    }
    await expect(
      sync.applyRemoteChange({
        ...remote,
        entityType: 'task',
        entity: incoming,
      }),
    ).rejects.toMatchObject({
      conflict: { type: 'DuplicateUniqueInvariant', invariant: 'focus' },
    })

    const backup = createCompleteBackupData()
    await value.routine_logs.add(backup.routineLogs[0]!)
    const duplicateRoutineLog = createRoutineLog(
      {
        userId: USER,
        routineId: backup.routineLogs[0]!.routineId,
        date: backup.routineLogs[0]!.date,
      },
      { id: '00000000-0000-4000-8000-0000000000e1', now: NOW },
    )
    await expect(
      sync.applyRemoteChange({
        ...remote,
        entityType: 'routine_log',
        entity: duplicateRoutineLog,
      }),
    ).rejects.toBeInstanceOf(SyncConflictError)

    await value.daily_logs.add(backup.dailyLogs[0]!)
    await expect(
      sync.applyRemoteChange({
        ...remote,
        entityType: 'daily_log',
        entity: {
          ...backup.dailyLogs[0]!,
          id: '00000000-0000-4000-8000-0000000000e2',
        },
      }),
    ).rejects.toMatchObject({
      conflict: { type: 'DuplicateUniqueInvariant', invariant: 'daily_log' },
    })
  })

  it('keeps device identity on restore while discarding non-portable sync journal state', async () => {
    const value = database()
    await value.open()
    localStorage.setItem('daily-work-os:device-id:v1', DEVICE)
    await value.local_changes.add({
      id: '00000000-0000-4000-8000-0000000000f1',
      mutationId: MUTATION,
      deviceId: DEVICE,
      userId: USER,
      occurredAt: NOW,
      sequence: 1,
      entityType: 'task',
      entityId: TASK_ID,
      operation: 'create',
      baseVersion: 0,
      resultingVersion: 1,
      baseServerRevision: null,
      status: 'pending',
      acknowledgedAt: null,
    })

    await new DexieBackupRepository(value).replaceAll(
      USER,
      createCompleteBackupData(),
    )

    expect(new DeviceIdentityStore().getDeviceId()).toBe(DEVICE)
    await expect(value.local_changes.count()).resolves.toBe(0)
    await expect(value.sync_metadata.count()).resolves.toBe(0)
  })
})
