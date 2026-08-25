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
import { executeDexieWrite } from './executeDexieWrite'
import { validatePersistedRows } from './validatePersistedRows'

const cloneLog = (log: RoutineLog) => structuredClone(log)

export class DexieRoutineLogRepository implements RoutineLogRepository {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly table = database.routine_logs,
    private readonly transactionBound = false,
  ) {}

  async findForDate(userId: UserId, date: LocalDate): Promise<RoutineLog[]> {
    try {
      assertUserId(userId)
      return validatePersistedRows(
        this.database,
        'routine_logs',
        (await this.table.where('date').equals(date).toArray()).filter(
          (log) => log.userId === userId,
        ),
        validateRoutineLog,
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
    userId: UserId,
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null> {
    try {
      assertUserId(userId)
      const logs = await this.table
        .where('[routineId+date]')
        .equals([routineId, date])
        .toArray()
      const log = validatePersistedRows(
        this.database,
        'routine_logs',
        logs.filter((record) => record.userId === userId),
        validateRoutineLog,
      ).find((record) => record.deletedAt === null)
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
      const write = async () => {
        const current = await this.table.get(log.id)
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
          const sameDay = await this.table
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
        await this.table.put(cloneLog(log))
      }
      await (this.transactionBound
        ? write()
        : executeDexieWrite(this.database, this.table, write))
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
