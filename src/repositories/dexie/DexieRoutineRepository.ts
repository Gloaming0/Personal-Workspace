import type { Routine } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineRepository,
} from '@/repositories/contracts'
import {
  InvalidPersistedEntityError,
  RepositoryOwnershipError,
  RepositoryVersionConflictError,
  RoutinePersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  assertRepositoryOwner,
  assertUserId,
  validateRoutine,
} from '@/repositories/validation'
import { executeDexieWrite } from './executeDexieWrite'
import { validatePersistedRows } from './validatePersistedRows'

const cloneRoutine = (routine: Routine) => structuredClone(routine)

export class DexieRoutineRepository implements RoutineRepository {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly table = database.routines,
    private readonly transactionBound = false,
  ) {}

  async getById(userId: UserId, id: EntityId): Promise<Routine | null> {
    try {
      assertUserId(userId)
      const routine = await this.table.get(id)
      if (!routine || routine.userId !== userId) return null
      const validated = validateRoutine(routine)
      return validated.deletedAt === null ? cloneRoutine(validated) : null
    } catch (error) {
      throw new RoutinePersistenceError(`Routine ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async findByStatus(
    userId: UserId,
    statuses: readonly Routine['status'][],
  ): Promise<Routine[]> {
    try {
      assertUserId(userId)
      return validatePersistedRows(
        this.database,
        'routines',
        (await this.table.toArray()).filter(
          (routine) => routine.userId === userId,
        ),
        validateRoutine,
      )
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
    userId: UserId,
    routine: Routine,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      validateRoutine(routine)
      assertRepositoryOwner(userId, routine)
      const write = async () => {
        const current = await this.table.get(routine.id)
        if (current) assertRepositoryOwner(userId, current)
        const conflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            routine.version !== current.version + 1
          : options.expectedVersion !== undefined || routine.version !== 1
        if (conflict) {
          throw new RepositoryVersionConflictError(routine.id, 'Routine')
        }
        await this.table.put(cloneRoutine(routine))
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
      throw new RoutinePersistenceError(
        `Routine ${routine.id} could not be saved.`,
        { cause: error },
      )
    }
  }
}
