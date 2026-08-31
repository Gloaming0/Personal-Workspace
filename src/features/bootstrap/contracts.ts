import type { SyncBootstrapState } from '@/sync/contracts'

export type BootstrapDiscoveryDecision =
  | 'initialize_authenticated_workspace'
  | 'connect_local_data'
  | 'restore_cloud_data'
  | 'manual_choice_required'

export interface BootstrapDiscoveryResult {
  local: 'empty' | 'has_data'
  cloud: 'empty' | 'has_data'
  syncBootstrapState: SyncBootstrapState
  decision: BootstrapDiscoveryDecision
}

export interface LocalWorkspaceInspector {
  hasData(userId: string): Promise<boolean>
}
