import type { CloudSyncPort } from '@/cloud/contracts'
import type { SyncRepository } from '@/sync/contracts'
import type {
  BootstrapDiscoveryResult,
  LocalWorkspaceInspector,
} from './contracts'

export class BootstrapDiscoveryService {
  constructor(
    private readonly local: LocalWorkspaceInspector,
    private readonly cloud: CloudSyncPort,
    private readonly sync: SyncRepository,
  ) {}

  async inspect(
    authenticatedUserId: string,
  ): Promise<BootstrapDiscoveryResult> {
    const [localHasData, cloud, syncBootstrapState] = await Promise.all([
      this.local.hasData('local-user'),
      this.cloud.inspectCloudWorkspace(),
      this.sync.getBootstrapState(authenticatedUserId),
    ])
    const local = localHasData ? 'has_data' : 'empty'
    const cloudState = cloud.hasData ? 'has_data' : 'empty'
    const decision =
      local === 'empty' && cloudState === 'empty'
        ? 'initialize_authenticated_workspace'
        : local === 'has_data' && cloudState === 'empty'
          ? 'connect_local_data'
          : local === 'empty' && cloudState === 'has_data'
            ? 'restore_cloud_data'
            : 'manual_choice_required'
    return { local, cloud: cloudState, syncBootstrapState, decision }
  }
}
