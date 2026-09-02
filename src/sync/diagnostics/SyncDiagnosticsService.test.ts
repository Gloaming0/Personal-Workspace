import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { FixedDeviceIdentity } from '@/sync/DeviceIdentityStore'
import { DexieSyncRepository } from '@/sync/dexie/DexieSyncRepository'
import { SyncDiagnosticsService } from './SyncDiagnosticsService'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEVICE = '00000000-0000-4000-8000-0000000000d1'
const NOW = '2026-09-01T08:00:00.000Z'
let sequence = 0
const databases: DailyWorkDatabase[] = []

afterEach(async () => {
  databases.forEach((database) => database.close())
  await Promise.all(
    databases.splice(0).map((database) => Dexie.delete(database.name)),
  )
})

describe('SyncDiagnosticsService', () => {
  it('returns only support-safe state and abbreviated device identity', async () => {
    const database = new DailyWorkDatabase(`diagnostics-${++sequence}`)
    databases.push(database)
    await database.open()
    const repository = new DexieSyncRepository(database)
    await repository.setBootstrapState(USER, 'bootstrapped', NOW)
    const service = new SyncDiagnosticsService(
      database,
      repository,
      new FixedDeviceIdentity(DEVICE),
      () => NOW,
    )

    const report = await service.collect(USER, {
      status: 'idle',
      lastSuccessfulSyncAt: NOW,
      pendingMutationCount: 0,
      conflictCount: 0,
      safeErrorCode: null,
    })

    expect(report).toMatchObject({
      syncState: 'idle',
      bootstrapState: 'bootstrapped',
      device: '…000000d1',
      databaseVersion: 11,
      integrity: { ok: true, issueCount: 0 },
    })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(USER)
    expect(serialized).not.toContain(DEVICE)
    expect(serialized).not.toMatch(/token|payload|title|content/i)
  })
})
