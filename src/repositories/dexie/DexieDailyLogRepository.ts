import type { DailyLog } from '@/domain/entities'
import type { LocalDate, UserId } from '@/domain/shared'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import type { DailyLogRepository } from '@/repositories/contracts'
import {
  DailyLogAlreadyFinalizedError,
  DailyLogPersistenceError,
} from '@/repositories/errors'

export class DexieDailyLogRepository implements DailyLogRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async findByDate(userId: UserId, date: LocalDate) {
    try {
      const log = await this.database.daily_logs
        .where('[userId+date]')
        .equals([userId, date])
        .and((entry) => entry.deletedAt === null)
        .first()
      return log ? structuredClone(log) : null
    } catch (error) {
      throw new DailyLogPersistenceError('Daily Log could not be read.', {
        cause: error,
      })
    }
  }

  async finalize(log: DailyLog) {
    try {
      await this.database.transaction(
        'rw',
        this.database.daily_logs,
        async () => {
          const existing = await this.database.daily_logs
            .where('[userId+date]')
            .equals([log.userId, log.date])
            .and((entry) => entry.deletedAt === null)
            .first()
          if (existing) {
            throw new DailyLogAlreadyFinalizedError(log.userId, log.date)
          }
          await this.database.daily_logs.add(structuredClone(log))
        },
      )
    } catch (error) {
      if (error instanceof DailyLogAlreadyFinalizedError) throw error
      throw new DailyLogPersistenceError('Daily Log could not be finalized.', {
        cause: error,
      })
    }
  }
}
