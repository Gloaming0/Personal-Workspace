import type { SyncEntity } from '@/domain/shared'
import type { Instant, UserId } from '@/domain/shared'

export const syncEntityTypes = [
  'task',
  'waiting',
  'memo',
  'routine',
  'routine_log',
  'activity',
  'daily_log',
] as const

export type SyncEntityType = (typeof syncEntityTypes)[number]
export type LocalChangeOperation = 'create' | 'update' | 'delete'
export type LocalMutationStatus =
  'pending' | 'in_flight' | 'acknowledged' | 'conflicted' | 'failed_permanent'
export type SyncBootstrapState = 'clean' | 'requires_bootstrap' | 'bootstrapped'

export interface MutationMetadata {
  mutationId: string
  deviceId: string
  userId: UserId
  occurredAt: Instant
}

export interface MutationIntent {
  mutationId: string
  userId: UserId
  occurredAt?: Instant
}

export interface SyncMetadata {
  id: string
  userId: UserId
  entityType: SyncEntityType
  entityId: string
  localVersion: number
  baseServerRevision: number | null
  serverRevision: number | null
  serverVersion: number | null
  lastMutationId: string
  lastAcknowledgedMutationId: string | null
  lastModifiedByDeviceId: string
  updatedAt: Instant
}

/** Legacy Version 8 row. Version 9 never creates these records. */
export interface LocalMutationChange extends MutationMetadata {
  id: string
  sequence: number
  entityType: SyncEntityType
  entityId: string
  operation: LocalChangeOperation
  baseVersion: number
  resultingVersion: number
  baseServerRevision: number | null
  status: 'pending' | 'acknowledged'
  acknowledgedAt: Instant | null
}

export interface MutationEntityChange {
  sequence: number
  entityType: SyncEntityType
  entityId: string
  operation: LocalChangeOperation
  baseServerRevision: number | null
  baseLocalVersion: number
  resultingLocalVersion: number
  predecessorMutationId: string | null
  entitySnapshot: SyncEntity
}

export interface MutationEntityResult {
  entityType: SyncEntityType
  entityId: string
  serverRevision: number
  serverVersion: number
}

export interface MutationAck {
  mutationId: string
  entityResults: MutationEntityResult[]
}

export interface LocalMutationRecord extends MutationMetadata {
  commitOrder: number
  entityKeys: string[]
  changes: MutationEntityChange[]
  status: LocalMutationStatus
  acknowledgedAt: Instant | null
  entityResults: MutationEntityResult[]
  failureCode: string | null
}

export interface SyncDeviceState {
  id: string
  userId: UserId
  deviceId: string
  lastCommitOrder: number
  lastPulledRevision: number
  updatedAt: Instant
}

export interface SyncBootstrapRecord {
  userId: UserId
  state: SyncBootstrapState
  updatedAt: Instant
}

export type BootstrapProgressStage =
  | 'safety_backup_created'
  | 'ownership_migrated'
  | 'uploading'
  | 'server_committed'
  | 'downloading'
  | 'finalizing'

export interface BootstrapProgressRecord {
  userId: UserId
  bootstrapId: string
  sourceUserId: UserId
  deviceId: string
  mode: 'connect_local' | 'restore_cloud' | 'use_cloud'
  stage: BootstrapProgressStage
  nextChunkIndex: number
  totalChunks: number
  manifestHash: string | null
  serverResult: MutationAck | null
  highWatermark: number | null
  updatedAt: Instant
}

export interface OwnershipCheckpointRecord {
  bootstrapId: string
  sourceUserId: UserId
  targetUserId: UserId
  createdAt: Instant
  snapshot: unknown
}

export type SyncConflict =
  | {
      type: 'SameBaseConcurrentEdit'
      entityType: SyncEntityType
      entityId: string
    }
  | { type: 'DeleteVsUpdate'; entityType: SyncEntityType; entityId: string }
  | { type: 'ImmutableDailyLogConflict'; entityId: string; date: string }
  | {
      type: 'DuplicateUniqueInvariant'
      invariant: 'focus' | 'routine_log' | 'daily_log'
    }
  | { type: 'OwnershipConflict'; entityType: SyncEntityType; entityId: string }

export interface TombstoneRecord {
  entityType: SyncEntityType
  entity: SyncEntity
}

export interface RemoteEntityChange {
  userId: UserId
  entityType: SyncEntityType
  entity: SyncEntity
  operation: LocalChangeOperation
  baseServerRevision: number | null
  serverRevision: number
  serverVersion: number
  mutationId: string
  deviceId: string
  occurredAt: Instant
}

export interface RemoteChangePage {
  userId: UserId
  deviceId: string
  fromRevision: number
  toRevision: number
  changes: RemoteEntityChange[]
}

export interface PersistedSyncConflict {
  id: string
  userId: UserId
  mutationId: string | null
  entityType: SyncEntityType
  entityId: string
  conflict: SyncConflict
  remoteChange: RemoteEntityChange
  status: 'open' | 'resolved'
  createdAt: Instant
  resolvedAt: Instant | null
}

export interface ApplyRemotePageResult {
  applied: number
  conflicts: PersistedSyncConflict[]
  cursor: number
}

export interface SyncRepository {
  listPendingMutations(
    userId: UserId,
    deviceId?: string,
  ): Promise<LocalMutationRecord[]>
  markMutationInFlight(userId: UserId, mutationId: string): Promise<void>
  recoverInFlight(userId: UserId, deviceId: string): Promise<number>
  markMutationFailedPermanent(
    userId: UserId,
    mutationId: string,
    failureCode: string,
  ): Promise<void>
  listTombstones(
    userId: UserId,
    entityType?: SyncEntityType,
  ): Promise<TombstoneRecord[]>
  getEntityIncludingDeleted(
    userId: UserId,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncEntity | null>
  getSyncMetadata(
    userId: UserId,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncMetadata | null>
  applyRemotePage(page: RemoteChangePage): Promise<ApplyRemotePageResult>
  markMutationAcknowledged(
    userId: UserId,
    acknowledgement: MutationAck,
    acknowledgedAt: Instant,
  ): Promise<void>
  getPullCursor(userId: UserId, deviceId: string): Promise<number>
  getBootstrapState(userId: UserId): Promise<SyncBootstrapState>
  setBootstrapState(
    userId: UserId,
    state: SyncBootstrapState,
    updatedAt: Instant,
  ): Promise<void>
  listConflicts(userId: UserId): Promise<PersistedSyncConflict[]>
}

export class MutationAlreadyAppliedError extends Error {
  constructor(public readonly mutationId: string) {
    super('This mutation has already been applied.')
    this.name = 'MutationAlreadyAppliedError'
  }
}

export class SyncConflictError extends Error {
  constructor(public readonly conflict: SyncConflict) {
    super(conflict.type)
    this.name = 'SyncConflictError'
  }
}
