import type { RoutineLog } from '@/domain/entities'
import type { EntityId, LocalDate } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineLogRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  RoutineLogUniquenessError,
  RoutinePersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

const cloneLog = (log: RoutineLog) => structuredClone(log)

export class DexieRoutineLogRepository implements RoutineLogRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async findForDate(date: LocalDate): Promise<RoutineLog[]> {
    try {
      return (
        await this.database.routine_logs.where('date').equals(date).toArray()
      )
        .filter((log) => log.deletedAt === null)
        .map(cloneLog)
    } catch (error) {
      throw new RoutinePersistenceError('Routine logs could not be queried.', {
        cause: error,
      })
    }
  }

  async findByRoutineAndDate(
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null> {
    try {
      const logs = await this.database.routine_logs
        .where('[routineId+date]')
        .equals([routineId, date])
        .toArray()
      const log = logs.find((record) => record.deletedAt === null)
      return log ? cloneLog(log) : null
    } catch (error) {
      throw new RoutinePersistenceError('Routine log could not be read.', {
        cause: error,
      })
    }
  }

  async save(
    log: RoutineLog,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      await this.database.transaction(
        'rw',
        this.database.routine_logs,
        async () => {
          const current = await this.database.routine_logs.get(log.id)
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
        error instanceof RoutineLogUniquenessError
      ) {
        throw error
      }
      throw new RoutinePersistenceError('Routine log could not be saved.', {
        cause: error,
      })
    }
  }
}
