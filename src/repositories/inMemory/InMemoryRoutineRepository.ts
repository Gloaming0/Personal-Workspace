import type { Routine } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'

export class InMemoryRoutineRepository implements RoutineRepository {
  private readonly records = new Map<EntityId, Routine>()

  async getById(id: EntityId): Promise<Routine | null> {
    const routine = this.records.get(id)
    return routine && routine.deletedAt === null
      ? structuredClone(routine)
      : null
  }

  async findByStatus(
    statuses: readonly Routine['status'][],
  ): Promise<Routine[]> {
    return [...this.records.values()]
      .filter(
        (routine) =>
          routine.deletedAt === null && statuses.includes(routine.status),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((routine) => structuredClone(routine))
  }

  async save(
    routine: Routine,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    const current = this.records.get(routine.id)
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
