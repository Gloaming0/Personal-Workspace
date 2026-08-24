import type { Waiting } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  WaitingQuery,
  WaitingRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'

function cloneWaiting(waiting: Waiting): Waiting {
  return structuredClone(waiting)
}

export class InMemoryWaitingRepository implements WaitingRepository {
  private readonly waiting = new Map<EntityId, Waiting>()

  constructor(seed: readonly Waiting[] = []) {
    seed.forEach((waiting) =>
      this.waiting.set(waiting.id, cloneWaiting(waiting)),
    )
  }

  async getById(id: EntityId): Promise<Waiting | null> {
    const waiting = this.waiting.get(id)
    return waiting && waiting.deletedAt === null ? cloneWaiting(waiting) : null
  }

  async find(query: WaitingQuery): Promise<Waiting[]> {
    return [...this.waiting.values()]
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
    waiting: Waiting,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    const current = this.waiting.get(waiting.id)
    if (
      options.expectedVersion !== undefined &&
      current?.version !== options.expectedVersion
    ) {
      throw new RepositoryVersionConflictError(waiting.id, 'Waiting')
    }
    this.waiting.set(waiting.id, cloneWaiting(waiting))
  }
}
