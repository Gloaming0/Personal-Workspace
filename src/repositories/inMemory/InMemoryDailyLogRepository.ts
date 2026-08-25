import type { DailyLog } from '@/domain/entities'
import type { LocalDate, UserId } from '@/domain/shared'
import type { DailyLogRepository } from '@/repositories/contracts'
import { DailyLogAlreadyFinalizedError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateDailyLog,
} from '@/repositories/validation'

export class InMemoryDailyLogRepository implements DailyLogRepository {
  private readonly logs = new Map<string, DailyLog>()

  private key(userId: UserId, date: LocalDate) {
    return `${userId}:${date}`
  }

  async findByDate(userId: UserId, date: LocalDate) {
    assertUserId(userId)
    const log = this.logs.get(this.key(userId, date))
    return log ? structuredClone(validateDailyLog(log)) : null
  }

  async finalize(userId: UserId, log: DailyLog) {
    validateDailyLog(log)
    assertRepositoryOwner(userId, log)
    const key = this.key(log.userId, log.date)
    if (this.logs.has(key)) {
      throw new DailyLogAlreadyFinalizedError(log.userId, log.date)
    }
    this.logs.set(key, structuredClone(log))
  }
}
