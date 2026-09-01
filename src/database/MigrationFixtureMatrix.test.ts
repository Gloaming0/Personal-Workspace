import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createActivity } from '@/domain/activity'
import { finalizeDailyLog } from '@/domain/dailyLog'
import type { DailyLog } from '@/domain/entities'
import type { SyncEntity } from '@/domain/shared'
import { createMemo } from '@/domain/memo'
import { createRoutine } from '@/domain/routine'
import { createRoutineLog } from '@/domain/routineLog'
import { createTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import {
  activityStoreSchema,
  confirmationStoreSchema,
  DailyWorkDatabase,
  dailyLogStoreSchema,
  localChangeStoreSchema,
  localMutationStoreSchema,
  memoStoreSchema,
  routineLogStoreSchema,
  routineStoreSchema,
  syncMetadataStoreSchema,
  syncBootstrapStoreSchema,
  syncConflictStoreSchema,
  syncDeviceStateStoreSchema,
  taskStoreSchema,
  bootstrapProgressStoreSchema,
  ownershipCheckpointStoreSchema,
  conflictResolutionStoreSchema,
} from './DailyWorkDatabase'

const NOW = '2026-08-25T08:00:00.000Z'
const DELETED = '2026-08-25T09:00:00.000Z'
const USER = 'migration-user'

const storeSchemas = {
  tasks: taskStoreSchema,
  confirmations: confirmationStoreSchema,
  memos: memoStoreSchema,
  routines: routineStoreSchema,
  routine_logs: routineLogStoreSchema,
  activities: activityStoreSchema,
  daily_logs: dailyLogStoreSchema,
  local_changes: localChangeStoreSchema,
  sync_metadata: syncMetadataStoreSchema,
}

const storesAtVersion = (version: number) =>
  Object.fromEntries(
    Object.entries(storeSchemas).filter(([name]) => {
      const introduced = {
        tasks: 1,
        confirmations: 2,
        memos: 3,
        routines: 4,
        routine_logs: 4,
        activities: 5,
        daily_logs: 6,
        local_changes: 8,
        sync_metadata: 8,
      }[name]
      return introduced !== undefined && introduced <= version
    }),
  )

class FixtureDatabase extends Dexie {
  constructor(name: string, version: number) {
    super(name)
    this.version(version).stores(storesAtVersion(version))
  }
}

function tombstone<T extends SyncEntity>(entity: T): T {
  return {
    ...entity,
    deletedAt: DELETED,
    updatedAt: DELETED,
    version: 2,
  }
}

function buildFixtures() {
  const task = createTask(
    {
      userId: USER,
      title: '保留任务 ✓',
      notes: null,
      plannedDate: '2026-08-25',
    },
    { id: 'migration-task-active', now: NOW },
  )
  const waiting = createWaiting(
    {
      userId: USER,
      title: '等待 José',
      person: null,
      followUpDate: null,
    },
    { id: 'migration-waiting-active', now: NOW },
  )
  const memo = createMemo(
    { userId: USER, content: '便签 Привет', projectId: null },
    { id: 'migration-memo-active', now: NOW },
  )
  const routine = createRoutine(
    {
      userId: USER,
      title: '每日复盘 🌙',
      schedule: { frequency: 'weekly', daysOfWeek: [1, 5] },
      timezone: 'Asia/Shanghai',
    },
    { id: 'migration-routine-active', now: NOW },
  )
  const routineLog = createRoutineLog(
    { userId: USER, routineId: routine.id, date: '2026-08-25' },
    { id: 'migration-routine-log-active', now: NOW },
  )
  const activity = createActivity(
    {
      userId: USER,
      eventType: 'task_created',
      entityType: 'task',
      entityId: task.id,
      title: '保留任务 ✓',
      projectId: null,
    },
    { id: 'migration-activity-active', now: NOW },
  )
  const dailyLog = finalizeDailyLog(
    {
      userId: USER,
      date: '2026-08-25',
      finalizeTimezone: 'UTC',
      summary: '总结：mañana',
      snapshot: {
        completedTasks: [],
        openTasks: [
          {
            entityId: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            projectName: null,
            plannedDate: task.plannedDate,
            dueAt: null,
          },
        ],
        waiting: [],
        memos: [{ entityId: memo.id, content: memo.content }],
        routines: [],
      },
    },
    { id: 'migration-daily-log-active', now: NOW },
  )

  return {
    tasks: [task, tombstone({ ...task, id: 'migration-task-deleted' })],
    confirmations: [
      waiting,
      tombstone({ ...waiting, id: 'migration-waiting-deleted' }),
    ],
    memos: [memo, tombstone({ ...memo, id: 'migration-memo-deleted' })],
    routines: [
      routine,
      tombstone({ ...routine, id: 'migration-routine-deleted' }),
    ],
    routine_logs: [
      routineLog,
      tombstone({ ...routineLog, id: 'migration-routine-log-deleted' }),
    ],
    activities: [
      activity,
      tombstone({ ...activity, id: 'migration-activity-deleted' }),
    ],
    daily_logs: [
      dailyLog,
      tombstone({ ...dailyLog, id: 'migration-daily-log-deleted' }),
    ],
    local_changes: [
      {
        id: '00000000-0000-4000-8000-000000000901',
        mutationId: '00000000-0000-4000-8000-000000000902',
        deviceId: '00000000-0000-4000-8000-000000000903',
        userId: USER,
        occurredAt: NOW,
        sequence: 1,
        entityType: 'task',
        entityId: task.id,
        operation: 'update',
        baseVersion: 1,
        resultingVersion: 2,
        baseServerRevision: null,
        status: 'pending',
        acknowledgedAt: null,
      },
    ],
    sync_metadata: [
      {
        id: `${USER}:task:${task.id}`,
        userId: USER,
        entityType: 'task',
        entityId: task.id,
        localVersion: 1,
        baseServerRevision: null,
        serverRevision: null,
        lastMutationId: '00000000-0000-4000-8000-000000000902',
        lastModifiedByDeviceId: '00000000-0000-4000-8000-000000000903',
        updatedAt: NOW,
      },
    ],
  }
}

let sequence = 0
describe.each([1, 2, 3, 4, 5, 6, 7, 8])(
  'migration fixture v%i -> v11',
  (version) => {
    const connections: Array<{ close(): void }> = []
    let name = ''

    afterEach(async () => {
      connections.forEach((connection) => connection.close())
      if (name) await Dexie.delete(name)
    })

    it('preserves every historical store and applies only the declared migration', async () => {
      name = `migration-matrix-v${version}-${++sequence}`
      const fixtures = buildFixtures()
      const legacy = new FixtureDatabase(name, version)
      connections.push(legacy)
      await legacy.open()

      for (const storeName of Object.keys(storesAtVersion(version))) {
        const rows = fixtures[storeName as keyof typeof fixtures].map((row) =>
          structuredClone(row),
        )
        if (storeName === 'daily_logs' && version <= 6) {
          rows.forEach(
            (row) => delete (row as Partial<DailyLog>).finalizeTimezone,
          )
        }
        await legacy.table(storeName).bulkAdd(rows)
      }
      legacy.close()

      const current = new DailyWorkDatabase(name)
      connections.push(current)
      await current.open()

      for (const storeName of Object.keys(storesAtVersion(version))) {
        if (storeName === 'local_changes' || storeName === 'sync_metadata') {
          continue
        }
        const rows = await current.table(storeName).orderBy('id').toArray()
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.version)).toEqual([1, 2])
        expect(rows.find((row) => row.deletedAt)?.deletedAt).toBe(DELETED)
        if (storeName === 'daily_logs') {
          expect(rows.every((row) => row.finalizeTimezone === 'UTC')).toBe(true)
        }
      }

      await expect(
        current.tasks.get('migration-task-active'),
      ).resolves.toMatchObject({
        title: '保留任务 ✓',
        notes: null,
      })
      await expect(
        new DexieTaskRepository(current).find(USER, {}),
      ).resolves.toHaveLength(1)
      await expect(current.local_changes.count()).resolves.toBe(0)
      await expect(current.sync_metadata.count()).resolves.toBe(0)
      await expect(current.local_mutations.count()).resolves.toBe(0)
      await expect(current.sync_conflicts.count()).resolves.toBe(0)
      await expect(current.sync_bootstrap.get(USER)).resolves.toMatchObject({
        state: 'requires_bootstrap',
      })
    })
  },
)

describe('migration fixture v9 -> v10', () => {
  let name = ''
  const connections: Array<{ close(): void }> = []

  afterEach(async () => {
    connections.forEach((connection) => connection.close())
    if (name) await Dexie.delete(name)
  })

  it('preserves the formal sync contract and adds empty bootstrap recovery stores', async () => {
    name = `migration-matrix-v9-${++sequence}`
    const legacy = new Dexie(name)
    connections.push(legacy)
    legacy.version(9).stores({
      ...storesAtVersion(8),
      local_mutations: localMutationStoreSchema,
      sync_device_state: syncDeviceStateStoreSchema,
      sync_conflicts: syncConflictStoreSchema,
      sync_bootstrap: syncBootstrapStoreSchema,
    })
    await legacy.open()
    const fixtures = buildFixtures()
    await legacy.table('tasks').bulkPut(fixtures.tasks)
    await legacy.table('sync_metadata').bulkPut(fixtures.sync_metadata)
    await legacy.table('sync_bootstrap').put({
      userId: USER,
      state: 'requires_bootstrap',
      updatedAt: NOW,
    })
    legacy.close()

    const current = new DailyWorkDatabase(name)
    connections.push(current)
    await current.open()

    await expect(current.tasks.count()).resolves.toBe(2)
    await expect(current.sync_metadata.toArray()).resolves.toEqual(
      fixtures.sync_metadata,
    )
    await expect(current.sync_bootstrap.get(USER)).resolves.toMatchObject({
      state: 'requires_bootstrap',
    })
    await expect(current.bootstrap_progress.count()).resolves.toBe(0)
    await expect(current.ownership_checkpoints.count()).resolves.toBe(0)
  })
})

describe('migration fixture v10 -> v11', () => {
  let name = ''
  const connections: Array<{ close(): void }> = []

  afterEach(async () => {
    connections.forEach((connection) => connection.close())
    if (name) await Dexie.delete(name)
  })

  it('preserves sync conflicts and adds empty idempotent resolution receipts', async () => {
    name = `migration-matrix-v10-${++sequence}`
    const legacy = new Dexie(name)
    connections.push(legacy)
    legacy.version(10).stores({
      ...storesAtVersion(8),
      local_mutations: localMutationStoreSchema,
      sync_device_state: syncDeviceStateStoreSchema,
      sync_conflicts: syncConflictStoreSchema,
      sync_bootstrap: syncBootstrapStoreSchema,
      bootstrap_progress: bootstrapProgressStoreSchema,
      ownership_checkpoints: ownershipCheckpointStoreSchema,
    })
    await legacy.open()
    await legacy.table('sync_conflicts').put({
      id: 'legacy-conflict',
      userId: USER,
      mutationId: null,
      entityType: 'task',
      entityId: 'legacy-task',
      conflict: {
        type: 'SameBaseConcurrentEdit',
        entityType: 'task',
        entityId: 'legacy-task',
      },
      remoteChange: {},
      status: 'open',
      createdAt: NOW,
      resolvedAt: null,
    })
    legacy.close()

    const current = new DailyWorkDatabase(name)
    connections.push(current)
    await current.open()

    await expect(
      current.sync_conflicts.get('legacy-conflict'),
    ).resolves.toMatchObject({
      status: 'open',
      resolutionId: null,
      resolutionAction: null,
    })
    await expect(current.conflict_resolutions.count()).resolves.toBe(0)
    expect(conflictResolutionStoreSchema).toContain('resolutionId')
  })
})
