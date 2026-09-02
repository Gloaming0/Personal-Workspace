import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createTask } from '@/domain/task'
import { createWaiting } from '@/domain/waiting'
import type { LocalMutationRecord } from '@/sync/contracts'
import { mutationEntityKey } from '@/sync/journal'
import { auditDatabaseIntegrity } from './auditDatabaseIntegrity'
import { DailyWorkDatabase } from './DailyWorkDatabase'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const TASK = '00000000-0000-4000-8000-0000000000b1'
const MISSING = '00000000-0000-4000-8000-0000000000b9'
const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000a2'
const NOW = '2026-09-01T08:00:00.000Z'
let sequence = 0
const databases: DailyWorkDatabase[] = []

function mutation(
  mutationId: string,
  predecessorMutationId: string,
  version: number,
): LocalMutationRecord {
  const snapshot = {
    ...createTask(
      { userId: USER, title: `v${version}`, plannedDate: '2026-09-01' },
      { id: TASK, now: NOW },
    ),
    version,
  }
  return {
    mutationId,
    userId: USER,
    deviceId: DEVICE,
    occurredAt: NOW,
    commitOrder: version,
    entityKeys: [mutationEntityKey('task', TASK)],
    changes: [
      {
        sequence: 1,
        entityType: 'task',
        entityId: TASK,
        operation: 'update',
        baseServerRevision: 1,
        baseLocalVersion: version - 1,
        resultingLocalVersion: version,
        predecessorMutationId,
        entitySnapshot: snapshot,
      },
    ],
    status: 'pending',
    acknowledgedAt: null,
    entityResults: [],
    failureCode: null,
  }
}

afterEach(async () => {
  databases.forEach((database) => database.close())
  await Promise.all(
    databases.splice(0).map((database) => Dexie.delete(database.name)),
  )
})

describe('read-only database integrity audit', () => {
  it('reports a clean database without modifying it', async () => {
    const database = new DailyWorkDatabase(`audit-clean-${++sequence}`)
    databases.push(database)
    await database.open()
    await database.tasks.add(
      createTask(
        { userId: USER, title: 'Safe', plannedDate: '2026-09-01' },
        { id: TASK, now: NOW },
      ),
    )

    const before = await database.tasks.toArray()
    const report = await auditDatabaseIntegrity(database, () => NOW)

    expect(report).toEqual({
      ok: true,
      checkedAt: NOW,
      issueCount: 0,
      issues: [],
    })
    expect(await database.tasks.toArray()).toEqual(before)
  })

  it('aggregates broken references, orphan metadata and causal cycles without content', async () => {
    const database = new DailyWorkDatabase(`audit-errors-${++sequence}`)
    databases.push(database)
    await database.open()
    const task = {
      ...createTask(
        { userId: USER, title: 'Private title', plannedDate: '2026-09-01' },
        { id: TASK, now: NOW },
      ),
      version: 3,
    }
    await database.tasks.add(task)
    await database.confirmations.add(
      createWaiting(
        { userId: USER, title: 'Private waiting', sourceTaskId: MISSING },
        { id: '00000000-0000-4000-8000-0000000000c1', now: NOW },
      ),
    )
    await database.sync_metadata.add({
      id: `${USER}:task:${MISSING}`,
      userId: USER,
      entityType: 'task',
      entityId: MISSING,
      localVersion: 1,
      baseServerRevision: 1,
      serverRevision: 1,
      serverVersion: 1,
      lastMutationId: A,
      lastAcknowledgedMutationId: A,
      lastModifiedByDeviceId: DEVICE,
      updatedAt: NOW,
    })
    await database.local_mutations.bulkAdd([
      mutation(A, B, 2),
      mutation(B, A, 3),
    ])

    const report = await auditDatabaseIntegrity(database, () => NOW)
    const codes = report.issues.map((issue) => issue.code)

    expect(report.ok).toBe(false)
    expect(codes).toEqual(
      expect.arrayContaining([
        'broken_reference',
        'invalid_sync_metadata',
        'causal_cycle',
      ]),
    )
    expect(JSON.stringify(report)).not.toContain('Private')
  })
})
