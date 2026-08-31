import {
  DefaultUnitOfWorkTransaction,
  type UnitOfWork,
  type UnitOfWorkRepositories,
  type UnitOfWorkExecutionOptions,
  type UnitOfWorkStore,
} from '../contracts'
import type { InMemoryTransactionalStore } from './transactionalStore'
import type { SyncEntity } from '@/domain/shared'
import { toPersistedChange } from '@/repositories/dexie/changeNotification'
import type { LocalChangeStore } from '@/database/LocalChangeCoordinator'
import {
  FixedDeviceIdentity,
  type DeviceIdentityProvider,
} from '@/sync/DeviceIdentityStore'
import { createMutationMetadata } from '@/sync/journal'
import { MutationAlreadyAppliedError } from '@/sync/contracts'
import type { InMemoryMutationJournal } from '@/sync/inMemory/InMemoryMutationJournal'

export type InMemoryUnitOfWorkStores = Partial<
  Record<UnitOfWorkStore, InMemoryTransactionalStore>
>

export interface InMemoryUnitOfWorkOptions {
  journal?: InMemoryMutationJournal
  deviceIdentity?: DeviceIdentityProvider
  createId?: () => string
  now?: () => string
}

const localStoreNames: Record<UnitOfWorkStore, LocalChangeStore> = {
  tasks: 'tasks',
  waiting: 'confirmations',
  memos: 'memos',
  routines: 'routines',
  routineLogs: 'routine_logs',
  dailyLogs: 'daily_logs',
  activities: 'activities',
}

function changedEntities(
  store: UnitOfWorkStore,
  before: unknown,
  after: unknown,
) {
  const previous = new Map(before as [string, SyncEntity][])
  return (after as [string, SyncEntity][])
    .filter(([id, entity]) => {
      const old = previous.get(id)
      return !old || JSON.stringify(old) !== JSON.stringify(entity)
    })
    .map(([, entity]) => toPersistedChange(localStoreNames[store], entity))
}

export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly resources: InMemoryUnitOfWorkStores,
    private readonly options: InMemoryUnitOfWorkOptions = {},
  ) {}

  execute<T>(
    stores: readonly UnitOfWorkStore[],
    command: (transaction: DefaultUnitOfWorkTransaction) => Promise<T>,
    options: UnitOfWorkExecutionOptions = {},
  ): Promise<T> {
    const run = async () => {
      const uniqueStores = [...new Set(stores)]
      const participants = uniqueStores.map((store) => {
        const resource = this.resources[store]
        if (!resource) {
          throw new Error(`No In-memory transaction resource for ${store}.`)
        }
        return {
          resource,
          snapshot: resource.createTransactionSnapshot(),
        }
      })
      const journalSnapshot = this.options.journal?.createTransactionSnapshot()
      const createId = this.options.createId ?? (() => crypto.randomUUID())
      const now = this.options.now ?? (() => new Date().toISOString())
      const deviceIdentity =
        this.options.deviceIdentity ??
        new FixedDeviceIdentity('00000000-0000-4000-8000-000000000001')
      let mutationMetadata:
        ReturnType<typeof createMutationMetadata> | undefined
      const resolveMutation = (userId: string) => {
        mutationMetadata ??= createMutationMetadata(
          userId,
          deviceIdentity,
          options.mutation,
          createId,
          now,
        )
        if (mutationMetadata.userId !== userId) {
          throw new Error('A mutation cannot change data for multiple users.')
        }
        return mutationMetadata
      }
      try {
        const result = await command(
          new DefaultUnitOfWorkTransaction(uniqueStores)
            .withRepositories(this.resources as Partial<UnitOfWorkRepositories>)
            .withMutationResolver(resolveMutation),
        )
        if (this.options.journal) {
          const changes = participants.flatMap(
            ({ resource, snapshot }, index) =>
              changedEntities(
                uniqueStores[index]!,
                snapshot,
                resource.createTransactionSnapshot(),
              ),
          )
          if (changes.length > 0) {
            const owners = new Set(changes.map((change) => change.userId))
            if (owners.size !== 1) {
              throw new Error(
                'A mutation cannot change data for multiple users.',
              )
            }
            const mutation = resolveMutation(changes[0]!.userId)
            if (
              this.options.journal.hasMutation(
                mutation.userId,
                mutation.mutationId,
              )
            ) {
              throw new MutationAlreadyAppliedError(mutation.mutationId)
            }
            this.options.journal.record(changes, mutation)
          }
        }
        return result
      } catch (error) {
        participants
          .reverse()
          .forEach(({ resource, snapshot }) =>
            resource.restoreTransactionSnapshot(snapshot),
          )
        if (this.options.journal && journalSnapshot) {
          this.options.journal.restoreTransactionSnapshot(journalSnapshot)
        }
        throw error
      }
    }

    const result = this.queue.then(run, run)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
