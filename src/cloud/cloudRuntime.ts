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
import { DeviceIdentityStore } from '@/sync/DeviceIdentityStore'
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
      ready: Promise.resolve(),
    }
  }
  const client = createBrowserSupabaseClient(environment)
  const cloudPort = new SupabaseCloudSyncAdapter(asRpcClient(client))
  const database = new DailyWorkDatabase()
  const ready = initializeLocalDatabase(database)
  const backupRepository = new DexieBackupRepository(database)
  const bootstrapLocal = new DexieBootstrapRepository(database)
  return {
    configured: true,
    authGateway: new SupabaseAuthGateway(client, environment.authRedirectUrl),
    cloudPort,
    bootstrapDiscovery: new BootstrapDiscoveryService(
      new DexieLocalWorkspaceInspector(backupRepository),
      cloudPort,
      new DexieSyncRepository(database),
    ),
    bootstrapCoordinator: new BootstrapCoordinator(
      bootstrapLocal,
      cloudPort,
      new BackupService(backupRepository),
      new DeviceIdentityStore(),
    ),
    ready,
  }
}

let runtime: CloudRuntime | undefined

export function getCloudRuntime(): CloudRuntime {
  runtime ??= createCloudRuntime()
  return runtime
}
