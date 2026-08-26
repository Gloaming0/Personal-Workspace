import type { PersistedChange } from '@/repositories/dexie/changeNotification'
import type { InMemoryTransactionalStore } from '@/unitOfWork/inMemory/transactionalStore'
import type {
  LocalMutationChange,
  MutationMetadata,
  SyncMetadata,
} from '../contracts'
import { toLocalMutationChange, toSyncMetadata } from '../journal'

interface JournalSnapshot {
  changes: LocalMutationChange[]
  metadata: SyncMetadata[]
}

export class InMemoryMutationJournal implements InMemoryTransactionalStore {
  private changes: LocalMutationChange[] = []
  private metadata = new Map<string, SyncMetadata>()

  createTransactionSnapshot(): JournalSnapshot {
    return structuredClone({
      changes: this.changes,
      metadata: [...this.metadata.values()],
    })
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    const value = structuredClone(snapshot as JournalSnapshot)
    this.changes = value.changes
    this.metadata = new Map(value.metadata.map((entry) => [entry.id, entry]))
  }

  hasMutation(userId: string, mutationId: string): boolean {
    return this.changes.some(
      (change) => change.userId === userId && change.mutationId === mutationId,
    )
  }

  record(
    persistedChanges: readonly PersistedChange[],
    mutation: MutationMetadata,
    createId: () => string,
  ): void {
    persistedChanges.forEach((change, index) => {
      const current = this.metadata.get(
        `${mutation.userId}:${change.entityType}:${change.entityId}`,
      )
      const metadata = toSyncMetadata(change, mutation, current)
      this.metadata.set(metadata.id, metadata)
      this.changes.push(
        toLocalMutationChange(
          change,
          mutation,
          index + 1,
          createId,
          current?.serverRevision ?? null,
        ),
      )
    })
  }

  listPending(userId: string): LocalMutationChange[] {
    return structuredClone(
      this.changes.filter(
        (change) => change.userId === userId && change.status === 'pending',
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
