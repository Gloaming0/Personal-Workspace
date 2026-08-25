import type { Waiting } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  WaitingQuery,
  WaitingRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateWaiting,
} from '@/repositories/validation'
import {
  createMapSnapshot,
  restoreMapSnapshot,
  type InMemoryTransactionalStore,
} from '@/unitOfWork/inMemory/transactionalStore'

function cloneWaiting(waiting: Waiting): Waiting {
  return structuredClone(waiting)
}

export class InMemoryWaitingRepository
  implements WaitingRepository, InMemoryTransactionalStore
{
  private readonly waiting = new Map<EntityId, Waiting>()

  constructor(seed: readonly Waiting[] = []) {
    seed.forEach((waiting) =>
      this.waiting.set(waiting.id, cloneWaiting(waiting)),
    )
  }

  createTransactionSnapshot(): unknown {
    return createMapSnapshot(this.waiting)
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    restoreMapSnapshot(this.waiting, snapshot)
  }

  async getById(userId: UserId, id: EntityId): Promise<Waiting | null> {
    assertUserId(userId)
    const waiting = this.waiting.get(id)
    if (!waiting || waiting.userId !== userId) return null
    const validated = validateWaiting(waiting)
    return validated.deletedAt === null ? cloneWaiting(validated) : null
  }

  async find(userId: UserId, query: WaitingQuery): Promise<Waiting[]> {
    assertUserId(userId)
    return [...this.waiting.values()]
      .filter((waiting) => waiting.userId === userId)
      .map(validateWaiting)
      .filter((waiting) => waiting.deletedAt === null)
      .filter(
        (waiting) => !query.statuses || query.statuses.includes(waiting.status),
      )
      .filter(
        (waiting) =>
          !query.followUpOnOrBefore ||
          (waiting.followUpDate !== null &&
            waiting.followUpDate <= query.followUpOnOrBefore),
      )
      .filter(
        (waiting) => !query.projectId || waiting.projectId === query.projectId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneWaiting)
  }

  async save(
    userId: UserId,
    waiting: Waiting,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    validateWaiting(waiting)
    assertRepositoryOwner(userId, waiting)
    const current = this.waiting.get(waiting.id)
    if (current) assertRepositoryOwner(userId, current)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        waiting.version !== current.version + 1
      : options.expectedVersion !== undefined || waiting.version !== 1
    if (conflict) {
      throw new RepositoryVersionConflictError(waiting.id, 'Waiting')
    }
    this.waiting.set(waiting.id, cloneWaiting(waiting))
  }
}
