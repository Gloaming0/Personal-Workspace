import type { Routine, RoutineSchedule, RoutineStatus } from './entities'
import type { EntityId, Instant, LocalDate, UserId } from './shared'
import { routineTransitions } from './transitions'

export class RoutineRuleError extends Error {
  constructor(
    public readonly code:
      'empty_title' | 'invalid_transition' | 'invalid_schedule',
  ) {
    super(code)
    this.name = 'RoutineRuleError'
  }
}

export interface CreateRoutineInput {
  userId: UserId
  title: string
  schedule: RoutineSchedule
  timezone: string
  sortOrder?: number
}

interface RoutineContext {
  id: EntityId
  now: Instant
}

function normalizeSchedule(schedule: RoutineSchedule): RoutineSchedule {
  if (schedule.frequency !== 'weekly') return schedule
  const daysOfWeek = [...new Set(schedule.daysOfWeek)].sort((a, b) => a - b)
  if (
    daysOfWeek.length === 0 ||
    daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    throw new RoutineRuleError('invalid_schedule')
  }
  return { frequency: 'weekly', daysOfWeek }
}

export function createRoutine(
  input: CreateRoutineInput,
  context: RoutineContext,
): Routine {
  const title = input.title.trim()
  if (!title) throw new RoutineRuleError('empty_title')
  return {
    id: context.id,
    userId: input.userId,
    title,
    status: 'active',
    schedule: normalizeSchedule(input.schedule),
    timezone: input.timezone,
    sortOrder: input.sortOrder ?? 0,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}

export function transitionRoutine(
  routine: Routine,
  status: RoutineStatus,
  now: Instant,
): Routine {
  const allowed = routineTransitions[routine.status] as readonly RoutineStatus[]
  if (!allowed.includes(status)) {
    throw new RoutineRuleError('invalid_transition')
  }
  return { ...routine, status, updatedAt: now, version: routine.version + 1 }
}

export function isRoutineScheduledOn(
  schedule: RoutineSchedule,
  date: LocalDate,
): boolean {
  const dayOfWeek = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  switch (schedule.frequency) {
    case 'daily':
      return true
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5
    case 'weekly':
      return schedule.daysOfWeek.includes(dayOfWeek)
  }
}
