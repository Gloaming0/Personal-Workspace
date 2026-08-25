import type { RoutineLog } from '@/domain/entities'
import type { EntityId, LocalDate, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  RoutineLogRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  RoutineLogUniquenessError,
} from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateRoutineLog,
} from '@/repositories/validation'

export class InMemoryRoutineLogRepository implements RoutineLogRepository {
  private readonly records = new Map<EntityId, RoutineLog>()

  async findForDate(userId: UserId, date: LocalDate): Promise<RoutineLog[]> {
    assertUserId(userId)
    return [...this.records.values()]
      .filter((log) => log.userId === userId)
      .map(validateRoutineLog)
      .filter((log) => log.date === date && log.deletedAt === null)
      .map((log) => structuredClone(log))
  }

  async findByRoutineAndDate(
    userId: UserId,
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null> {
    assertUserId(userId)
    const log = [...this.records.values()]
      .filter((record) => record.userId === userId)
      .map(validateRoutineLog)
      .find(
        (record) =>
          record.routineId === routineId &&
          record.date === date &&
          record.deletedAt === null,
      )
    return log ? structuredClone(log) : null
  }

  async save(
    userId: UserId,
    log: RoutineLog,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    validateRoutineLog(log)
    assertRepositoryOwner(userId, log)
    const current = this.records.get(log.id)
    if (current) assertRepositoryOwner(userId, current)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        log.version !== current.version + 1
      : options.expectedVersion !== undefined || log.version !== 1
    if (conflict) throw new RepositoryVersionConflictError(log.id, 'RoutineLog')
    if (
      log.deletedAt === null &&
      [...this.records.values()].some(
        (record) =>
          record.id !== log.id &&
          record.userId === log.userId &&
          record.routineId === log.routineId &&
          record.date === log.date &&
          record.deletedAt === null,
      )
    ) {
      throw new RoutineLogUniquenessError(log.routineId, log.date)
    }
    this.records.set(log.id, structuredClone(log))
  }
}
