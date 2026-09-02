import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { createTask } from '@/domain/task'
import { createActivity } from '@/domain/activity'
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { BackupService } from './BackupService'
import { DexieBackupRepository } from './DexieBackupRepository'
import type { BackupData } from './format'
import { createCompleteBackupData, fixtureIds } from './testFixtures'

const OLD_TASK_ID = '00000000-0000-4000-8000-000000000090'
const DEVICE_ID = '00000000-0000-4000-8000-0000000000d1'

async function seed(database: DailyWorkDatabase, data: BackupData) {
  await database.tasks.bulkAdd(data.tasks)
  await database.confirmations.bulkAdd(data.waiting)
  await database.memos.bulkAdd(data.memos)
  await database.routines.bulkAdd(data.routines)
  await database.routine_logs.bulkAdd(data.routineLogs)
  await database.activities.bulkAdd(data.activities)
  await database.daily_logs.bulkAdd(data.dailyLogs)
}

let sequence = 0
describe('Dexie Backup Repository', () => {
  let database: DailyWorkDatabase
  let name = ''

  beforeEach(async () => {
    name = `backup-repository-${++sequence}`
    database = new DailyWorkDatabase(name)
    await database.open()
  })

  afterEach(async () => {
    database.close()
    await Dexie.delete(name)
  })

  it('round-trips complete history and keeps tombstones hidden from business queries', async () => {
    const expected = createCompleteBackupData()
    const newerActivity = createActivity(
      {
        userId: 'local-user',
        eventType: 'task_focus_set',
        entityType: 'task',
        entityId: fixtureIds.task,
        title: expected.tasks[0]!.title,
      },
      {
        id: '00000000-0000-4000-8000-000000000009',
        now: '2026-08-25T10:00:00.000Z',
      },
    )
    expected.activities.push(newerActivity)
    await seed(database, expected)
    const repository = new DexieBackupRepository(database)
    const exported = await repository.readAll('local-user')
    expect(exported).toEqual(expected)

    await database.transaction(
      'rw',
      [
        database.tasks,
        database.confirmations,
        database.memos,
        database.routines,
        database.routine_logs,
        database.activities,
        database.daily_logs,
      ],
      async () => {
        await Promise.all([
          database.tasks.clear(),
          database.confirmations.clear(),
          database.memos.clear(),
          database.routines.clear(),
          database.routine_logs.clear(),
          database.activities.clear(),
          database.daily_logs.clear(),
        ])
      },
    )

    await repository.replaceAll('local-user', exported)

    await expect(repository.readAll('local-user')).resolves.toEqual(expected)
    await expect(
      new DexieTaskRepository(database).find('local-user', {}),
    ).resolves.toEqual([expected.tasks[0]])
    await expect(
      new DexieActivityRepository(database).find('local-user', {}),
    ).resolves.toMatchObject([
      { id: newerActivity.id },
      { id: fixtureIds.activity },
    ])
    await expect(database.daily_logs.get(fixtureIds.dailyLog)).resolves.toEqual(
      expected.dailyLogs[0],
    )
  })

  it('rolls back every store when an injected write fails', async () => {
    const oldTask = createTask(
      {
        userId: 'local-user',
        title: 'Original remains',
        plannedDate: '2026-08-25',
      },
      { id: OLD_TASK_ID, now: '2026-08-25T07:00:00.000Z' },
    )
    await database.tasks.add(oldTask)
    const before = {
      tasks: await database.tasks.toArray(),
      waiting: await database.confirmations.toArray(),
      memos: await database.memos.toArray(),
      routines: await database.routines.toArray(),
      routineLogs: await database.routine_logs.toArray(),
      activities: await database.activities.toArray(),
      dailyLogs: await database.daily_logs.toArray(),
    }
    const repository = new DexieBackupRepository(database, {
      failAfterStore: 'memos',
    })
    const publish = vi.spyOn(database.changes, 'publish')

    await expect(
      repository.replaceAll('local-user', createCompleteBackupData()),
    ).rejects.toMatchObject({ code: 'restore-failed' })

    await expect(database.tasks.toArray()).resolves.toEqual(before.tasks)
    await expect(database.confirmations.toArray()).resolves.toEqual(
      before.waiting,
    )
    await expect(database.memos.toArray()).resolves.toEqual(before.memos)
    await expect(database.routines.toArray()).resolves.toEqual(before.routines)
    await expect(database.routine_logs.toArray()).resolves.toEqual(
      before.routineLogs,
    )
    await expect(database.activities.toArray()).resolves.toEqual(
      before.activities,
    )
    await expect(database.daily_logs.toArray()).resolves.toEqual(
      before.dailyLogs,
    )
    expect(publish).not.toHaveBeenCalled()
  })

  it('creates a safety backup of original data and broadcasts every restored store', async () => {
    const oldTask = createTask(
      {
        userId: 'local-user',
        title: 'Safety copy',
        plannedDate: '2026-08-25',
      },
      { id: OLD_TASK_ID, now: '2026-08-25T07:00:00.000Z' },
    )
    await database.tasks.add(oldTask)
    const repository = new DexieBackupRepository(database)
    const service = new BackupService(repository, {
      now: () => '2026-08-25T10:00:00.000Z',
    })
    const incomingRepository = {
      readAll: vi.fn(async () => createCompleteBackupData()),
      replaceAll: vi.fn(),
    }
    const incoming = await new BackupService(incomingRepository, {
      now: () => '2026-08-25T09:00:00.000Z',
    }).createBackup('local-user', 'UTC')
    const safety = vi.fn(async () => undefined)
    const publish = vi.spyOn(database.changes, 'publish')

    await service.restore('local-user', incoming.backup, 'UTC', {
      save: safety,
    })

    expect(safety).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tasks: [oldTask] }),
      }),
      'daily-work-os-safety-backup-2026-08-25.json',
    )
    expect(publish).toHaveBeenCalledTimes(7)
    expect(new Set(publish.mock.calls.map(([change]) => change.store))).toEqual(
      new Set([
        'tasks',
        'confirmations',
        'memos',
        'routines',
        'routine_logs',
        'activities',
        'daily_logs',
      ]),
    )
  })

  it('preserves other users while replacing only the current owner', async () => {
    const otherTask = createTask(
      {
        userId: 'other-user',
        title: 'Other owner',
        plannedDate: '2026-08-25',
      },
      {
        id: '00000000-0000-4000-8000-000000000091',
        now: '2026-08-25T07:00:00.000Z',
      },
    )
    await database.tasks.add(otherTask)

    await new DexieBackupRepository(database).replaceAll(
      'local-user',
      createCompleteBackupData(),
    )

    await expect(database.tasks.get(otherTask.id)).resolves.toEqual(otherTask)
  })

  it('clears cloud transport state, preserves device identity and requires a new bootstrap decision', async () => {
    await database.sync_device_state.put({
      id: `local-user:${DEVICE_ID}`,
      userId: 'local-user',
      deviceId: DEVICE_ID,
      lastCommitOrder: 7,
      lastPulledRevision: 42,
      updatedAt: '2026-08-25T10:00:00.000Z',
    })
    await database.local_mutations.put({
      mutationId: '00000000-0000-4000-8000-0000000000a1',
      userId: 'local-user',
    } as never)
    await database.sync_metadata.put({
      id: 'local-user:task:transport-task',
      userId: 'local-user',
    } as never)
    await database.sync_conflicts.put({
      id: 'transport-conflict',
      userId: 'local-user',
    } as never)
    await database.conflict_resolutions.put({
      resolutionId: '00000000-0000-4000-8000-0000000000c1',
      userId: 'local-user',
    } as never)
    await database.sync_bootstrap.put({
      userId: 'local-user',
      state: 'bootstrapped',
      updatedAt: '2026-08-25T10:00:00.000Z',
    })

    await new DexieBackupRepository(database).replaceAll(
      'local-user',
      createCompleteBackupData(),
    )

    await expect(
      database.local_mutations
        .filter((row) => row.userId === 'local-user')
        .count(),
    ).resolves.toBe(0)
    await expect(
      database.sync_metadata
        .filter((row) => row.userId === 'local-user')
        .count(),
    ).resolves.toBe(0)
    await expect(
      database.sync_conflicts
        .filter((row) => row.userId === 'local-user')
        .count(),
    ).resolves.toBe(0)
    await expect(
      database.conflict_resolutions
        .filter((row) => row.userId === 'local-user')
        .count(),
    ).resolves.toBe(0)
    await expect(
      database.sync_device_state.get(`local-user:${DEVICE_ID}`),
    ).resolves.toMatchObject({
      deviceId: DEVICE_ID,
      lastCommitOrder: 7,
      lastPulledRevision: 0,
    })
    await expect(
      database.sync_bootstrap.get('local-user'),
    ).resolves.toMatchObject({ state: 'requires_bootstrap' })
  })
})
