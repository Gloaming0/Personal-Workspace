import type { Routine, RoutineLog } from '@/domain/entities'
import {
  createRoutine,
  isRoutineScheduledOn,
  transitionRoutine,
  type CreateRoutineInput,
} from '@/domain/routine'
import { createRoutineLog, softDeleteRoutineLog } from '@/domain/routineLog'
import type { EntityId, Instant, LocalDate, UserId } from '@/domain/shared'
import type {
  RoutineLogRepository,
  RoutineRepository,
} from '@/repositories/contracts'
import { ActivityService } from '@/features/activity/ActivityService'

export class RoutineNotFoundError extends Error {
  constructor(id: EntityId) {
    super(`Routine ${id} was not found.`)
    this.name = 'RoutineNotFoundError'
  }
}

export class RoutineCompletionError extends Error {
  constructor(
    public readonly code: 'inactive' | 'not_scheduled' | 'not_completed',
  ) {
    super(code)
    this.name = 'RoutineCompletionError'
  }
}

interface RoutineServiceContext {
  createId: () => EntityId
  now: () => Instant
}

const defaultContext: RoutineServiceContext = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export class RoutineService {
  constructor(
    private readonly routines: RoutineRepository,
    private readonly logs: RoutineLogRepository,
    private readonly context: RoutineServiceContext = defaultContext,
    private readonly activities?: ActivityService,
  ) {}

  async create(input: CreateRoutineInput): Promise<Routine> {
    const routine = createRoutine(input, {
      id: this.context.createId(),
      now: this.context.now(),
    })
    await this.routines.save(input.userId, routine)
    return routine
  }

  pause(userId: UserId, id: EntityId): Promise<Routine> {
    return this.transition(userId, id, 'paused')
  }

  resume(userId: UserId, id: EntityId): Promise<Routine> {
    return this.transition(userId, id, 'active')
  }

  archive(userId: UserId, id: EntityId): Promise<Routine> {
    return this.transition(userId, id, 'archived')
  }

  async complete(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog> {
    const routine = await this.requireRoutine(userId, id)
    if (routine.status !== 'active')
      throw new RoutineCompletionError('inactive')
    if (!isRoutineScheduledOn(routine.schedule, date)) {
      throw new RoutineCompletionError('not_scheduled')
    }
    const existing = await this.logs.findByRoutineAndDate(userId, id, date)
    if (existing) return existing
    const log = createRoutineLog(
      { userId: routine.userId, routineId: id, date },
      { id: this.context.createId(), now: this.context.now() },
    )
    await this.logs.save(userId, log)
    await this.record(routine, 'routine_completed')
    return log
  }

  async undo(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog> {
    const routine = await this.requireRoutine(userId, id)
    const log = await this.logs.findByRoutineAndDate(userId, id, date)
    if (!log) throw new RoutineCompletionError('not_completed')
    const deleted = softDeleteRoutineLog(log, this.context.now())
    await this.logs.save(userId, deleted, { expectedVersion: log.version })
    await this.record(routine, 'routine_completion_undone')
    return deleted
  }

  private async transition(
    userId: UserId,
    id: EntityId,
    status: 'active' | 'paused' | 'archived',
  ): Promise<Routine> {
    const current = await this.requireRoutine(userId, id)
    const next = transitionRoutine(current, status, this.context.now())
    await this.routines.save(userId, next, {
      expectedVersion: current.version,
    })
    return next
  }

  private async requireRoutine(userId: UserId, id: EntityId): Promise<Routine> {
    const routine = await this.routines.getById(userId, id)
    if (!routine) throw new RoutineNotFoundError(id)
    return routine
  }

  private async record(
    routine: Routine,
    eventType: 'routine_completed' | 'routine_completion_undone',
  ): Promise<void> {
    await this.activities?.record({
      userId: routine.userId,
      eventType,
      entityType: 'routine',
      entityId: routine.id,
      title: routine.title,
    })
  }
}
