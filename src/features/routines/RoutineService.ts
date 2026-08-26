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
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { ActivityService } from '@/features/activity/ActivityService'
import {
  executeAtomic,
  type UnitOfWork,
  type UnitOfWorkTransaction,
} from '@/unitOfWork/contracts'

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
    private readonly unitOfWork: UnitOfWork,
    private readonly context: RoutineServiceContext = defaultContext,
    private readonly activities?: ActivityService,
  ) {}

  async create(input: CreateRoutineInput): Promise<Routine> {
    return executeAtomic(this.unitOfWork, ['routines'], async (transaction) => {
      const routine = createRoutine(input, {
        id: this.context.createId(),
        now: this.context.now(),
      })
      await transaction.repository('routines').save(input.userId, routine)
      return routine
    })
  }

  pause(
    userId: UserId,
    id: EntityId,
    expectedVersion?: number,
  ): Promise<Routine> {
    return this.transition(userId, id, 'paused', expectedVersion)
  }

  resume(
    userId: UserId,
    id: EntityId,
    expectedVersion?: number,
  ): Promise<Routine> {
    return this.transition(userId, id, 'active', expectedVersion)
  }

  archive(
    userId: UserId,
    id: EntityId,
    expectedVersion?: number,
  ): Promise<Routine> {
    return this.transition(userId, id, 'archived', expectedVersion)
  }

  async complete(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
    expectedVersion?: number,
  ): Promise<RoutineLog> {
    return executeAtomic(
      this.unitOfWork,
      this.logStores(),
      async (transaction) => {
        const routines = transaction.repository('routines')
        const logs = transaction.repository('routineLogs')
        const routine = await this.requireRoutine(routines, userId, id)
        this.assertExpectedVersion(routine, expectedVersion)
        if (routine.status !== 'active')
          throw new RoutineCompletionError('inactive')
        if (!isRoutineScheduledOn(routine.schedule, date)) {
          throw new RoutineCompletionError('not_scheduled')
        }
        const existing = await logs.findByRoutineAndDate(userId, id, date)
        if (existing) return existing
        const log = createRoutineLog(
          { userId: routine.userId, routineId: id, date },
          { id: this.context.createId(), now: this.context.now() },
        )
        await logs.save(userId, log)
        await this.record(routine, 'routine_completed', transaction)
        return log
      },
    )
  }

  async undo(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
    expectedVersion?: number,
  ): Promise<RoutineLog> {
    return executeAtomic(
      this.unitOfWork,
      this.logStores(),
      async (transaction) => {
        const routines = transaction.repository('routines')
        const logs = transaction.repository('routineLogs')
        const routine = await this.requireRoutine(routines, userId, id)
        this.assertExpectedVersion(routine, expectedVersion)
        const log = await logs.findByRoutineAndDate(userId, id, date)
        if (!log) throw new RoutineCompletionError('not_completed')
        const deleted = softDeleteRoutineLog(log, this.context.now())
        await logs.save(userId, deleted, { expectedVersion: log.version })
        await this.record(routine, 'routine_completion_undone', transaction)
        return deleted
      },
    )
  }

  private async transition(
    userId: UserId,
    id: EntityId,
    status: 'active' | 'paused' | 'archived',
    expectedVersion?: number,
  ): Promise<Routine> {
    return executeAtomic(this.unitOfWork, ['routines'], async (transaction) => {
      const routines = transaction.repository('routines')
      const current = await this.requireRoutine(routines, userId, id)
      this.assertExpectedVersion(current, expectedVersion)
      const next = transitionRoutine(current, status, this.context.now())
      await routines.save(userId, next, {
        expectedVersion: current.version,
      })
      return next
    })
  }

  private assertExpectedVersion(
    routine: Routine,
    expectedVersion?: number,
  ): void {
    if (expectedVersion !== undefined && routine.version !== expectedVersion) {
      throw new RepositoryVersionConflictError(routine.id, 'Routine')
    }
  }

  private logStores() {
    return this.activities
      ? (['routines', 'routineLogs', 'activities'] as const)
      : (['routines', 'routineLogs'] as const)
  }

  private async requireRoutine(
    repository: RoutineRepository,
    userId: UserId,
    id: EntityId,
  ): Promise<Routine> {
    const routine = await repository.getById(userId, id)
    if (!routine) throw new RoutineNotFoundError(id)
    return routine
  }

  private async record(
    routine: Routine,
    eventType: 'routine_completed' | 'routine_completion_undone',
    transaction: UnitOfWorkTransaction,
  ): Promise<void> {
    if (this.activities)
      await this.activities.record(
        {
          userId: routine.userId,
          eventType,
          entityType: 'routine',
          entityId: routine.id,
          title: routine.title,
        },
        transaction.repository('activities'),
        transaction.mutation(routine.userId),
      )
  }
}
