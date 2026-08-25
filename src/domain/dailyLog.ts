import type { DailyLog, DailyLogSnapshot } from './entities'
import type { EntityId, Instant, LocalDate, UserId } from './shared'

export interface FinalizeDailyLogInput {
  userId: UserId
  date: LocalDate
  summary?: string
  snapshot: DailyLogSnapshot
}

interface FinalizeDailyLogContext {
  id: EntityId
  now: Instant
}

export function finalizeDailyLog(
  input: FinalizeDailyLogInput,
  context: FinalizeDailyLogContext,
): DailyLog {
  return {
    id: context.id,
    userId: input.userId,
    date: input.date,
    summary: input.summary?.trim() ?? '',
    finalizedAt: context.now,
    snapshot: structuredClone(input.snapshot),
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}
