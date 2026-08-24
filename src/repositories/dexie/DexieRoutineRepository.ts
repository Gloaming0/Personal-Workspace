import type { Routine } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  RoutinePersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

const cloneRoutine = (routine: Routine) => structuredClone(routine)

export class DexieRoutineRepository implements RoutineRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async getById(id: EntityId): Promise<Routine | null> {
    try {
      const routine = await this.database.routines.get(id)
      return routine && routine.deletedAt === null
        ? cloneRoutine(routine)
        : null
    } catch (error) {
      throw new RoutinePersistenceError(`Routine ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async findByStatus(
    statuses: readonly Routine['status'][],
  ): Promise<Routine[]> {
    try {
      return (await this.database.routines.toArray())
        .filter(
          (routine) =>
            routine.deletedAt === null && statuses.includes(routine.status),
        )
        .sort((left, right) =>
          left.sortOrder === right.sortOrder
            ? left.createdAt.localeCompare(right.createdAt)
            : left.sortOrder - right.sortOrder,
        )
        .map(cloneRoutine)
    } catch (error) {
      throw new RoutinePersistenceError('Routines could not be queried.', {
        cause: error,
      })
    }
  }

  async save(
    routine: Routine,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      await this.database.transaction(
        'rw',
        this.database.routines,
        async () => {
          const current = await this.database.routines.get(routine.id)
          const conflict = current
            ? (options.expectedVersion !== undefined &&
                current.version !== options.expectedVersion) ||
              routine.version !== current.version + 1
            : options.expectedVersion !== undefined || routine.version !== 1
          if (conflict) {
            throw new RepositoryVersionConflictError(routine.id, 'Routine')
          }
          await this.database.routines.put(cloneRoutine(routine))
        },
      )
    } catch (error) {
      if (error instanceof RepositoryVersionConflictError) throw error
      throw new RoutinePersistenceError(
        `Routine ${routine.id} could not be saved.`,
        { cause: error },
      )
    }
  }
}
