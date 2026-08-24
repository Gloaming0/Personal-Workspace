import type { Routine, RoutineLog } from '@/domain/entities'
import {
  createRoutine,
  isRoutineScheduledOn,
  transitionRoutine,
  type CreateRoutineInput,
} from '@/domain/routine'
import { createRoutineLog, softDeleteRoutineLog } from '@/domain/routineLog'
import type { EntityId, Instant, LocalDate } from '@/domain/shared'
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
    await this.routines.save(routine)
    return routine
  }

  pause(id: EntityId): Promise<Routine> {
    return this.transition(id, 'paused')
  }

  resume(id: EntityId): Promise<Routine> {
    return this.transition(id, 'active')
  }

  archive(id: EntityId): Promise<Routine> {
    return this.transition(id, 'archived')
  }

  async complete(id: EntityId, date: LocalDate): Promise<RoutineLog> {
    const routine = await this.requireRoutine(id)
    if (routine.status !== 'active')
      throw new RoutineCompletionError('inactive')
    if (!isRoutineScheduledOn(routine.schedule, date)) {
      throw new RoutineCompletionError('not_scheduled')
    }
    const existing = await this.logs.findByRoutineAndDate(id, date)
    if (existing) return existing
    const log = createRoutineLog(
      { userId: routine.userId, routineId: id, date },
      { id: this.context.createId(), now: this.context.now() },
    )
    await this.logs.save(log)
    await this.record(routine, 'routine_completed')
    return log
  }

  async undo(id: EntityId, date: LocalDate): Promise<RoutineLog> {
    const routine = await this.requireRoutine(id)
    const log = await this.logs.findByRoutineAndDate(id, date)
    if (!log) throw new RoutineCompletionError('not_completed')
    const deleted = softDeleteRoutineLog(log, this.context.now())
    await this.logs.save(deleted, { expectedVersion: log.version })
    await this.record(routine, 'routine_completion_undone')
    return deleted
  }

  private async transition(
    id: EntityId,
    status: 'active' | 'paused' | 'archived',
  ): Promise<Routine> {
    const current = await this.requireRoutine(id)
    const next = transitionRoutine(current, status, this.context.now())
    await this.routines.save(next, { expectedVersion: current.version })
    return next
  }

  private async requireRoutine(id: EntityId): Promise<Routine> {
    const routine = await this.routines.getById(id)
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
