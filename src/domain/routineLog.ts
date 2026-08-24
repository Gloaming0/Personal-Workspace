import type { RoutineLog } from './entities'
import type { EntityId, Instant, LocalDate, UserId } from './shared'

export function createRoutineLog(
  input: { userId: UserId; routineId: EntityId; date: LocalDate },
  context: { id: EntityId; now: Instant },
): RoutineLog {
  return {
    id: context.id,
    userId: input.userId,
    routineId: input.routineId,
    date: input.date,
    completedAt: context.now,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}

export function softDeleteRoutineLog(
  log: RoutineLog,
  now: Instant,
): RoutineLog {
  return {
    ...log,
    deletedAt: now,
    updatedAt: now,
    version: log.version + 1,
  }
}
