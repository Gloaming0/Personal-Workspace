import type { Waiting } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  WaitingQuery,
  WaitingRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  RepositoryOwnershipError,
  InvalidPersistedEntityError,
  WaitingPersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  assertRepositoryOwner,
  assertUserId,
  validateWaiting,
} from '@/repositories/validation'
import { executeDexieWrite } from './executeDexieWrite'
import { validatePersistedRows } from './validatePersistedRows'

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
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly table = database.confirmations,
    private readonly transactionBound = false,
  ) {}

  async getById(userId: UserId, id: EntityId): Promise<Waiting | null> {
    try {
      assertUserId(userId)
      const waiting = await this.table.get(id)
      if (!waiting || waiting.userId !== userId) return null
      const validated = validateWaiting(waiting)
      return validated.deletedAt === null ? cloneWaiting(validated) : null
    } catch (error) {
      throw new WaitingPersistenceError(`Waiting ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(userId: UserId, query: WaitingQuery): Promise<Waiting[]> {
    try {
      assertUserId(userId)
      const waiting = await this.table.toArray()
      return validatePersistedRows(
        this.database,
        'confirmations',
        waiting.filter((entity) => entity.userId === userId),
        validateWaiting,
      )
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
    userId: UserId,
    waiting: Waiting,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      validateWaiting(waiting)
      assertRepositoryOwner(userId, waiting)
      const write = async () => {
        const current = await this.table.get(waiting.id)
        if (current) assertRepositoryOwner(userId, current)
        const versionConflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            waiting.version !== current.version + 1
          : options.expectedVersion !== undefined || waiting.version !== 1

        if (versionConflict) {
          throw new RepositoryVersionConflictError(waiting.id, 'Waiting')
        }
        await this.table.put(cloneWaiting(waiting))
      }
      await (this.transactionBound
        ? write()
        : executeDexieWrite(this.database, this.table, write))
    } catch (error) {
      if (
        error instanceof RepositoryVersionConflictError ||
        error instanceof RepositoryOwnershipError ||
        error instanceof InvalidPersistedEntityError
      )
        throw error
      throw new WaitingPersistenceError(
        `Waiting ${waiting.id} could not be saved.`,
        { cause: error },
      )
    }
  }
}
