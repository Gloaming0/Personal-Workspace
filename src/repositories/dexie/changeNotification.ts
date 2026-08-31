import type { SyncEntity } from '@/domain/shared'
import type { LocalChangeStore } from '@/database/LocalChangeCoordinator'
import type { LocalChangeOperation, SyncEntityType } from '@/sync/contracts'

export interface PersistedChange {
  store: LocalChangeStore
  entityId: string
  entityVersion: number
  userId: string
  entityType: SyncEntityType
  operation: LocalChangeOperation
  baseVersion: number
  entitySnapshot: SyncEntity
}

export type PersistedChangeListener = (change: PersistedChange) => void

export function toPersistedChange(
  store: LocalChangeStore,
  entity: SyncEntity,
): PersistedChange {
  const entityTypes: Record<LocalChangeStore, SyncEntityType> = {
    tasks: 'task',
    confirmations: 'waiting',
    memos: 'memo',
    routines: 'routine',
    routine_logs: 'routine_log',
    activities: 'activity',
    daily_logs: 'daily_log',
  }
  return {
    store,
    entityId: entity.id,
    entityVersion: entity.version,
    userId: entity.userId,
    entityType: entityTypes[store],
    operation:
      entity.version === 1
        ? 'create'
        : entity.deletedAt !== null
          ? 'delete'
          : 'update',
    baseVersion: entity.version - 1,
    entitySnapshot: structuredClone(entity),
  }
}
