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
export type LocalChangeStatus = 'pending' | 'acknowledged'

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
  lastMutationId: string
  lastModifiedByDeviceId: string
  updatedAt: Instant
}

export interface LocalMutationChange extends MutationMetadata {
  id: string
  sequence: number
  entityType: SyncEntityType
  entityId: string
  operation: LocalChangeOperation
  baseVersion: number
  resultingVersion: number
  baseServerRevision: number | null
  status: LocalChangeStatus
  acknowledgedAt: Instant | null
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
  baseServerRevision: number | null
  serverRevision: number
  mutationId: string
  deviceId: string
  occurredAt: Instant
}

export interface SyncRepository {
  listPendingChanges(userId: UserId): Promise<LocalMutationChange[]>
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
  applyRemoteChange(change: RemoteEntityChange): Promise<void>
  markMutationAcknowledged(
    userId: UserId,
    mutationId: string,
    serverRevision: number,
    acknowledgedAt: Instant,
  ): Promise<void>
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
