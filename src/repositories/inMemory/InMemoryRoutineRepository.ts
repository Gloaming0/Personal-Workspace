import type { Routine } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateRoutine,
} from '@/repositories/validation'
import {
  createMapSnapshot,
  restoreMapSnapshot,
  type InMemoryTransactionalStore,
} from '@/unitOfWork/inMemory/transactionalStore'

export class InMemoryRoutineRepository
  implements RoutineRepository, InMemoryTransactionalStore
{
  private readonly records = new Map<EntityId, Routine>()

  createTransactionSnapshot(): unknown {
    return createMapSnapshot(this.records)
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    restoreMapSnapshot(this.records, snapshot)
  }

  async getById(userId: UserId, id: EntityId): Promise<Routine | null> {
    assertUserId(userId)
    const routine = this.records.get(id)
    if (!routine || routine.userId !== userId) return null
    const validated = validateRoutine(routine)
    return validated.deletedAt === null ? structuredClone(validated) : null
  }

  async findByStatus(
    userId: UserId,
    statuses: readonly Routine['status'][],
  ): Promise<Routine[]> {
    assertUserId(userId)
    return [...this.records.values()]
      .filter((routine) => routine.userId === userId)
      .map(validateRoutine)
      .filter(
        (routine) =>
          routine.deletedAt === null && statuses.includes(routine.status),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((routine) => structuredClone(routine))
  }

  async save(
    userId: UserId,
    routine: Routine,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    validateRoutine(routine)
    assertRepositoryOwner(userId, routine)
    const current = this.records.get(routine.id)
    if (current) assertRepositoryOwner(userId, current)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        routine.version !== current.version + 1
      : options.expectedVersion !== undefined || routine.version !== 1
    if (conflict)
      throw new RepositoryVersionConflictError(routine.id, 'Routine')
    this.records.set(routine.id, structuredClone(routine))
  }
}
