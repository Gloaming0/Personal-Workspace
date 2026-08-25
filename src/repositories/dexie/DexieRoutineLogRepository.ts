import type { RoutineLog } from '@/domain/entities'
import type { EntityId, LocalDate, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineLogRepository,
} from '@/repositories/contracts'
import {
  InvalidPersistedEntityError,
  RepositoryOwnershipError,
  RepositoryVersionConflictError,
  RoutineLogUniquenessError,
  RoutinePersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  assertRepositoryOwner,
  assertUserId,
  validateRoutineLog,
} from '@/repositories/validation'

const cloneLog = (log: RoutineLog) => structuredClone(log)

export class DexieRoutineLogRepository implements RoutineLogRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async findForDate(userId: UserId, date: LocalDate): Promise<RoutineLog[]> {
    try {
      assertUserId(userId)
      return (
        await this.database.routine_logs.where('date').equals(date).toArray()
      )
        .filter((log) => log.userId === userId)
        .map(validateRoutineLog)
        .filter((log) => log.deletedAt === null)
        .map(cloneLog)
    } catch (error) {
      throw new RoutinePersistenceError('Routine logs could not be queried.', {
        cause: error,
      })
    }
  }

  async findByRoutineAndDate(
    userId: UserId,
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null> {
    try {
      assertUserId(userId)
      const logs = await this.database.routine_logs
        .where('[routineId+date]')
        .equals([routineId, date])
        .toArray()
      const log = logs
        .filter((record) => record.userId === userId)
        .map(validateRoutineLog)
        .find((record) => record.deletedAt === null)
      return log ? cloneLog(log) : null
    } catch (error) {
      throw new RoutinePersistenceError('Routine log could not be read.', {
        cause: error,
      })
    }
  }

  async save(
    userId: UserId,
    log: RoutineLog,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      validateRoutineLog(log)
      assertRepositoryOwner(userId, log)
      await this.database.transaction(
        'rw',
        this.database.routine_logs,
        async () => {
          const current = await this.database.routine_logs.get(log.id)
          if (current) assertRepositoryOwner(userId, current)
          const conflict = current
            ? (options.expectedVersion !== undefined &&
                current.version !== options.expectedVersion) ||
              log.version !== current.version + 1
            : options.expectedVersion !== undefined || log.version !== 1
          if (conflict) {
            throw new RepositoryVersionConflictError(log.id, 'RoutineLog')
          }
          if (log.deletedAt === null) {
            const sameDay = await this.database.routine_logs
              .where('[userId+routineId+date]')
              .equals([log.userId, log.routineId, log.date])
              .toArray()
            if (
              sameDay.some(
                (existing) =>
                  existing.id !== log.id && existing.deletedAt === null,
              )
            ) {
              throw new RoutineLogUniquenessError(log.routineId, log.date)
            }
          }
          await this.database.routine_logs.put(cloneLog(log))
        },
      )
    } catch (error) {
      if (
        error instanceof RepositoryVersionConflictError ||
        error instanceof RoutineLogUniquenessError ||
        error instanceof RepositoryOwnershipError ||
        error instanceof InvalidPersistedEntityError
      ) {
        throw error
      }
      throw new RoutinePersistenceError('Routine log could not be saved.', {
        cause: error,
      })
    }
  }
}
