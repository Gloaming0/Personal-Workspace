import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import { DexieBackupRepository } from '@/features/backup/DexieBackupRepository'
import { BackupService } from '@/features/backup/BackupService'
import { BootstrapCoordinator } from '@/features/bootstrap/BootstrapCoordinator'
import { DexieBootstrapRepository } from '@/features/bootstrap/DexieBootstrapRepository'
import { BootstrapDiscoveryService } from '@/features/bootstrap/BootstrapDiscoveryService'
import type { LocalWorkspaceInspector } from '@/features/bootstrap/contracts'
import { SupabaseAuthGateway } from '@/features/auth/SupabaseAuthGateway'
import type { AuthGateway } from '@/features/auth/contracts'
import { DexieSyncRepository } from '@/sync/dexie/DexieSyncRepository'
import { ConflictResolutionService } from '@/sync/conflictResolution/ConflictResolutionService'
import { DexieConflictResolutionRepository } from '@/sync/conflictResolution/DexieConflictResolutionRepository'
import { DeviceIdentityStore } from '@/sync/DeviceIdentityStore'
import { SyncEngine } from '@/sync/engine/SyncEngine'
import { SyncStatusStore } from '@/sync/engine/SyncStatusStore'
import { BrowserSyncLock } from '@/sync/engine/BrowserSyncLock'
import { RealtimeInvalidationCoordinator } from '@/sync/realtime/RealtimeInvalidationCoordinator'
import { SupabaseRealtimeInvalidationAdapter } from '@/sync/realtime/SupabaseRealtimeInvalidationAdapter'
import { SyncDiagnosticsService } from '@/sync/diagnostics/SyncDiagnosticsService'
import type { CloudSyncPort } from './contracts'
import {
  SupabaseCloudSyncAdapter,
  type RpcClient,
} from './SupabaseCloudSyncAdapter'
import {
  createBrowserSupabaseClient,
  readSupabaseEnvironment,
} from './supabaseClient'

class DexieLocalWorkspaceInspector implements LocalWorkspaceInspector {
  constructor(private readonly repository: DexieBackupRepository) {}

  async hasData(userId: string): Promise<boolean> {
    const data = await this.repository.readAll(userId)
    return Object.values(data).some((rows) => rows.length > 0)
  }
}

function asRpcClient(client: SupabaseClient): RpcClient {
  return {
    async rpc(functionName, parameters) {
      const result = await client.rpc(
        functionName as never,
        parameters as never,
      )
      return result as {
        data: unknown
        error: { code?: string; message: string } | null
      }
    },
  }
}

export interface CloudRuntime {
  configured: boolean
  authGateway: AuthGateway | null
  cloudPort: CloudSyncPort | null
  bootstrapDiscovery: BootstrapDiscoveryService | null
  bootstrapCoordinator: BootstrapCoordinator | null
  syncEngine: SyncEngine | null
  realtimeCoordinator: RealtimeInvalidationCoordinator | null
  conflictResolution: ConflictResolutionService | null
  diagnostics: SyncDiagnosticsService | null
  localChanges: DailyWorkDatabase['changes'] | null
  ready: Promise<void>
}

export function createCloudRuntime(): CloudRuntime {
  const environment = readSupabaseEnvironment()
  if (!environment) {
    return {
      configured: false,
      authGateway: null,
      cloudPort: null,
      bootstrapDiscovery: null,
      bootstrapCoordinator: null,
      syncEngine: null,
      realtimeCoordinator: null,
      conflictResolution: null,
      diagnostics: null,
      localChanges: null,
      ready: Promise.resolve(),
    }
  }
  const client = createBrowserSupabaseClient(environment)
  const cloudPort = new SupabaseCloudSyncAdapter(asRpcClient(client))
  const database = new DailyWorkDatabase()
  const ready = initializeLocalDatabase(database)
  const backupRepository = new DexieBackupRepository(database)
  const bootstrapLocal = new DexieBootstrapRepository(database)
  const authGateway = new SupabaseAuthGateway(
    client,
    environment.authRedirectUrl,
  )
  const deviceIdentity = new DeviceIdentityStore()
  const syncRepository = new DexieSyncRepository(database)
  const syncEngine = new SyncEngine(
    syncRepository,
    cloudPort,
    new BrowserSyncLock(),
    new SyncStatusStore(),
    deviceIdentity.getDeviceId(),
    {
      refreshSession: async () =>
        (await authGateway.refreshSession())?.kind === 'authenticated',
    },
  )
  return {
    configured: true,
    authGateway,
    cloudPort,
    bootstrapDiscovery: new BootstrapDiscoveryService(
      new DexieLocalWorkspaceInspector(backupRepository),
      cloudPort,
      syncRepository,
    ),
    bootstrapCoordinator: new BootstrapCoordinator(
      bootstrapLocal,
      cloudPort,
      new BackupService(backupRepository),
      deviceIdentity,
    ),
    syncEngine,
    realtimeCoordinator: new RealtimeInvalidationCoordinator(
      new SupabaseRealtimeInvalidationAdapter(client),
      syncRepository,
      syncEngine,
    ),
    conflictResolution: new ConflictResolutionService(
      new DexieConflictResolutionRepository(database, { deviceIdentity }),
      cloudPort,
      deviceIdentity.getDeviceId(),
    ),
    diagnostics: new SyncDiagnosticsService(
      database,
      syncRepository,
      deviceIdentity,
    ),
    localChanges: database.changes,
    ready,
  }
}

let runtime: CloudRuntime | undefined

export function getCloudRuntime(): CloudRuntime {
  runtime ??= createCloudRuntime()
  return runtime
}
