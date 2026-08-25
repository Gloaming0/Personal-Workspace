import {
  DefaultUnitOfWorkTransaction,
  type UnitOfWork,
  type UnitOfWorkRepositories,
  type UnitOfWorkStore,
} from '../contracts'
import type { InMemoryTransactionalStore } from './transactionalStore'

export type InMemoryUnitOfWorkStores = Partial<
  Record<UnitOfWorkStore, InMemoryTransactionalStore>
>

export class InMemoryUnitOfWork implements UnitOfWork {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly resources: InMemoryUnitOfWorkStores) {}

  execute<T>(
    stores: readonly UnitOfWorkStore[],
    command: (transaction: DefaultUnitOfWorkTransaction) => Promise<T>,
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
      try {
        return await command(
          new DefaultUnitOfWorkTransaction(uniqueStores).withRepositories(
            this.resources as Partial<UnitOfWorkRepositories>,
          ),
        )
      } catch (error) {
        participants
          .reverse()
          .forEach(({ resource, snapshot }) =>
            resource.restoreTransactionSnapshot(snapshot),
          )
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
