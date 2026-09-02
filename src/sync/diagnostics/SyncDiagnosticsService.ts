import {
  currentDatabaseVersion,
  type DailyWorkDatabase,
} from '@/database/DailyWorkDatabase'
import { auditDatabaseIntegrity } from '@/database/auditDatabaseIntegrity'
import type { DeviceIdentityProvider } from '@/sync/DeviceIdentityStore'
import type { SyncRepository } from '@/sync/contracts'
import type { SyncState } from '@/sync/engine/contracts'

export interface SyncHealthDiagnostics {
  collectedAt: string
  syncState: SyncState['status']
  bootstrapState: string
  pendingMutationCount: number
  conflictCount: number
  failedPermanentCount: number
  currentCursor: number
  lastSuccessfulSyncAt: string | null
  device: string
  appVersion: string
  databaseVersion: number
  cloudSchemaVersion: string
  syncProtocolVersion: number
  databaseState: string
  latestErrorCategory: string | null
  integrity: {
    ok: boolean
    issueCount: number
    issueCodes: string[]
  }
}

/** Produces support-safe diagnostics without entity content, payloads or Auth data. */
export class SyncDiagnosticsService {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly repository: SyncRepository,
    private readonly deviceIdentity: DeviceIdentityProvider,
    private readonly now = () => new Date().toISOString(),
  ) {}

  async collect(
    userId: string,
    syncState: SyncState,
  ): Promise<SyncHealthDiagnostics> {
    const deviceId = this.deviceIdentity.getDeviceId()
    const [bootstrapState, queue, cursor, integrity] = await Promise.all([
      this.repository.getBootstrapState(userId),
      this.repository.getQueueCounts(userId),
      this.repository.getPullCursor(userId, deviceId),
      auditDatabaseIntegrity(this.database, this.now),
    ])
    const runtime = this.database.runtime.getSnapshot()
    const latestDiagnostic = this.database.runtime.diagnostics().at(-1)
    return {
      collectedAt: this.now(),
      syncState: syncState.status,
      bootstrapState,
      pendingMutationCount: queue.pending,
      conflictCount: queue.conflicts,
      failedPermanentCount: queue.failedPermanent,
      currentCursor: cursor,
      lastSuccessfulSyncAt: syncState.lastSuccessfulSyncAt,
      device: `…${deviceId.slice(-8)}`,
      appVersion: '0.1.0',
      databaseVersion: currentDatabaseVersion,
      cloudSchemaVersion: 'phase-3.5',
      syncProtocolVersion: 1,
      databaseState: runtime.status,
      latestErrorCategory:
        syncState.safeErrorCode ??
        runtime.errorCategory ??
        latestDiagnostic?.errorCategory ??
        null,
      integrity: {
        ok: integrity.ok,
        issueCount: integrity.issueCount,
        issueCodes: [...new Set(integrity.issues.map((issue) => issue.code))],
      },
    }
  }
}
