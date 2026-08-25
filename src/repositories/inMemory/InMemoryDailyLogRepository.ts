import type { DailyLog } from '@/domain/entities'
import type { LocalDate, UserId } from '@/domain/shared'
import type { DailyLogRepository } from '@/repositories/contracts'
import { DailyLogAlreadyFinalizedError } from '@/repositories/errors'

export class InMemoryDailyLogRepository implements DailyLogRepository {
  private readonly logs = new Map<string, DailyLog>()

  private key(userId: UserId, date: LocalDate) {
    return `${userId}:${date}`
  }

  async findByDate(userId: UserId, date: LocalDate) {
    const log = this.logs.get(this.key(userId, date))
    return log ? structuredClone(log) : null
  }

  async finalize(log: DailyLog) {
    const key = this.key(log.userId, log.date)
    if (this.logs.has(key)) {
      throw new DailyLogAlreadyFinalizedError(log.userId, log.date)
    }
    this.logs.set(key, structuredClone(log))
  }
}
