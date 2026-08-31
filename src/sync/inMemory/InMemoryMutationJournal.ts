import type { PersistedChange } from '@/repositories/dexie/changeNotification'
import type { InMemoryTransactionalStore } from '@/unitOfWork/inMemory/transactionalStore'
import type {
  LocalMutationRecord,
  MutationMetadata,
  SyncMetadata,
} from '../contracts'
import {
  syncDeviceStateId,
  syncMetadataId,
  toLocalMutationRecord,
  toSyncMetadata,
} from '../journal'

interface JournalSnapshot {
  mutations: LocalMutationRecord[]
  metadata: SyncMetadata[]
  commitOrders: [string, number][]
}

export class InMemoryMutationJournal implements InMemoryTransactionalStore {
  private mutations: LocalMutationRecord[] = []
  private metadata = new Map<string, SyncMetadata>()
  private commitOrders = new Map<string, number>()

  createTransactionSnapshot(): JournalSnapshot {
    return structuredClone({
      mutations: this.mutations,
      metadata: [...this.metadata.values()],
      commitOrders: [...this.commitOrders.entries()],
    })
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    const value = structuredClone(snapshot as JournalSnapshot)
    this.mutations = value.mutations
    this.metadata = new Map(value.metadata.map((entry) => [entry.id, entry]))
    this.commitOrders = new Map(value.commitOrders)
  }

  hasMutation(userId: string, mutationId: string): boolean {
    return this.mutations.some(
      (mutation) =>
        mutation.userId === userId && mutation.mutationId === mutationId,
    )
  }

  record(
    persistedChanges: readonly PersistedChange[],
    mutation: MutationMetadata,
  ): void {
    const metadataBefore = new Map<string, SyncMetadata | undefined>()
    persistedChanges.forEach((change) => {
      const id = syncMetadataId(
        mutation.userId,
        change.entityType,
        change.entityId,
      )
      metadataBefore.set(id, this.metadata.get(id))
    })
    const deviceKey = syncDeviceStateId(mutation.userId, mutation.deviceId)
    const commitOrder = (this.commitOrders.get(deviceKey) ?? 0) + 1
    this.mutations.push(
      toLocalMutationRecord(
        persistedChanges,
        mutation,
        commitOrder,
        metadataBefore,
      ),
    )
    this.commitOrders.set(deviceKey, commitOrder)
    persistedChanges.forEach((change) => {
      const id = syncMetadataId(
        mutation.userId,
        change.entityType,
        change.entityId,
      )
      const current = metadataBefore.get(id)
      const metadata = toSyncMetadata(change, mutation, current)
      this.metadata.set(metadata.id, metadata)
    })
  }

  listPending(userId: string): LocalMutationRecord[] {
    return structuredClone(
      this.mutations.filter(
        (mutation) =>
          mutation.userId === userId && mutation.status === 'pending',
      ),
    )
  }

  getMetadata(
    userId: string,
    entityType: string,
    entityId: string,
  ): SyncMetadata | null {
    const value = this.metadata.get(`${userId}:${entityType}:${entityId}`)
    return value ? structuredClone(value) : null
  }
}
