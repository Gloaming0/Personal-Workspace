import type { BackupData } from '@/features/backup/format'
import type { Instant, UserId } from '@/domain/shared'
import type { MutationEntityResult, SyncEntityType } from '@/sync/contracts'

export const bootstrapFormat = 'daily-work-os-bootstrap' as const
export const bootstrapFormatVersion = 1 as const
export const bootstrapChunkSize = 100

export interface BootstrapSnapshot {
  format: typeof bootstrapFormat
  formatVersion: typeof bootstrapFormatVersion
  ownerId: UserId
  capturedAt: Instant
  data: BackupData
}

export interface BootstrapEntityEntry {
  entityType: SyncEntityType
  entityId: string
  entitySnapshot: BackupData[keyof BackupData][number]
}

export interface BootstrapChunk {
  index: number
  idempotencyKey: string
  payload: {
    changes: Array<{
      entityType: SyncEntityType
      entityId: string
      operation: 'create'
      baseServerRevision: null
      entitySnapshot: BootstrapEntityEntry['entitySnapshot']
    }>
  }
}

export interface BootstrapCommitResult {
  bootstrapId: string
  status: 'committed'
  entityCount: number
  entityResults: MutationEntityResult[]
  highWatermark: number
}

export interface CloudBootstrapSnapshot {
  ownerId: UserId
  highWatermark: number
  capturedAt: Instant
  entries: Array<
    BootstrapEntityEntry & {
      serverRevision: number
      serverVersion: number
      mutationId: string
      deviceId: string
      occurredAt: Instant
    }
  >
}

const orderedCollections = [
  ['task', 'tasks'],
  ['waiting', 'waiting'],
  ['memo', 'memos'],
  ['routine', 'routines'],
  ['routine_log', 'routineLogs'],
  ['activity', 'activities'],
  ['daily_log', 'dailyLogs'],
] as const

export function flattenBootstrapSnapshot(
  snapshot: BootstrapSnapshot,
): BootstrapEntityEntry[] {
  return orderedCollections.flatMap(([entityType, collection]) =>
    [...snapshot.data[collection]]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entitySnapshot) => ({
        entityType,
        entityId: entitySnapshot.id,
        entitySnapshot,
      })),
  ) as BootstrapEntityEntry[]
}
