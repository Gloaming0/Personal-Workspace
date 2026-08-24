import type { Waiting } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  WaitingQuery,
  WaitingRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  WaitingPersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

function cloneWaiting(waiting: Waiting): Waiting {
  return structuredClone(waiting)
}

function matchesQuery(waiting: Waiting, query: WaitingQuery): boolean {
  return (
    waiting.deletedAt === null &&
    (!query.statuses || query.statuses.includes(waiting.status)) &&
    (!query.followUpOnOrBefore ||
      (waiting.followUpDate !== null &&
        waiting.followUpDate <= query.followUpOnOrBefore)) &&
    (!query.projectId || waiting.projectId === query.projectId)
  )
}

export class DexieWaitingRepository implements WaitingRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async getById(id: EntityId): Promise<Waiting | null> {
    try {
      const waiting = await this.database.confirmations.get(id)
      return waiting && waiting.deletedAt === null
        ? cloneWaiting(waiting)
        : null
    } catch (error) {
      throw new WaitingPersistenceError(`Waiting ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(query: WaitingQuery): Promise<Waiting[]> {
    try {
      const waiting = await this.database.confirmations.toArray()
      return waiting
        .filter((entity) => matchesQuery(entity, query))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(cloneWaiting)
    } catch (error) {
      throw new WaitingPersistenceError('Waiting items could not be queried.', {
        cause: error,
      })
    }
  }

  async save(
    waiting: Waiting,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      await this.database.transaction(
        'rw',
        this.database.confirmations,
        async () => {
          const current = await this.database.confirmations.get(waiting.id)
          const versionConflict = current
            ? (options.expectedVersion !== undefined &&
                current.version !== options.expectedVersion) ||
              waiting.version !== current.version + 1
            : options.expectedVersion !== undefined || waiting.version !== 1

          if (versionConflict) {
            throw new RepositoryVersionConflictError(waiting.id, 'Waiting')
          }
          await this.database.confirmations.put(cloneWaiting(waiting))
        },
      )
    } catch (error) {
      if (error instanceof RepositoryVersionConflictError) throw error
      throw new WaitingPersistenceError(
        `Waiting ${waiting.id} could not be saved.`,
        { cause: error },
      )
    }
  }
}
