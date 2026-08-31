import type { SyncBootstrapState } from '@/sync/contracts'
import type {
  BootstrapProgressRecord,
  MutationEntityResult,
} from '@/sync/contracts'
import type { BackupData } from '@/features/backup/format'
import type { BootstrapSnapshot, CloudBootstrapSnapshot } from './model'

export type BootstrapDiscoveryDecision =
  | 'initialize_authenticated_workspace'
  | 'connect_local_data'
  | 'restore_cloud_data'
  | 'manual_choice_required'
  | 'already_bootstrapped'

export interface BootstrapDiscoveryResult {
  local: 'empty' | 'has_data'
  cloud: 'empty' | 'has_data'
  syncBootstrapState: SyncBootstrapState
  decision: BootstrapDiscoveryDecision
}

export interface LocalWorkspaceInspector {
  hasData(userId: string): Promise<boolean>
}

export interface BootstrapLocalPort extends LocalWorkspaceInspector {
  createSnapshot(userId: string, capturedAt: string): Promise<BootstrapSnapshot>
  getProgress(userId: string): Promise<BootstrapProgressRecord | null>
  getBootstrapState(userId: string): Promise<SyncBootstrapState>
  initializeEmptyWorkspace(
    userId: string,
    deviceId: string,
    highWatermark: number,
    updatedAt: string,
  ): Promise<void>
  migrateOwnership(
    sourceUserId: string,
    targetUserId: string,
    bootstrapId: string,
    deviceId: string,
    updatedAt: string,
  ): Promise<void>
  beginCloudRestore(
    sourceUserId: string,
    targetUserId: string,
    bootstrapId: string,
    deviceId: string,
    mode: 'restore_cloud' | 'use_cloud',
    updatedAt: string,
  ): Promise<void>
  updateProgress(
    userId: string,
    update: Partial<BootstrapProgressRecord>,
  ): Promise<void>
  rollbackOwnership(userId: string, updatedAt: string): Promise<void>
  finalizeUploadedWorkspace(
    userId: string,
    deviceId: string,
    results: MutationEntityResult[],
    highWatermark: number,
    updatedAt: string,
  ): Promise<void>
  replaceWithCloud(
    sourceUserId: string,
    targetUserId: string,
    deviceId: string,
    snapshot: CloudBootstrapSnapshot,
    updatedAt: string,
  ): Promise<void>
  clearProgress(userId: string): Promise<void>
  readData(userId: string): Promise<BackupData>
}
