import type { SyncEntity } from '@/domain/shared'
import type { LocalChangeStore } from '@/database/LocalChangeCoordinator'

export interface PersistedChange {
  store: LocalChangeStore
  entityId: string
  entityVersion: number
}

export type PersistedChangeListener = (change: PersistedChange) => void

export function toPersistedChange(
  store: LocalChangeStore,
  entity: Pick<SyncEntity, 'id' | 'version'>,
): PersistedChange {
  return {
    store,
    entityId: entity.id,
    entityVersion: entity.version,
  }
}
