import type { EntityId, LocalDate } from '@/domain/shared'

export class RepositoryVersionConflictError extends Error {
  constructor(id: EntityId, entityName = 'Entity') {
    super(`${entityName} ${id} was changed by another operation.`)
    this.name = 'RepositoryVersionConflictError'
  }
}

export class RepositoryOwnershipError extends Error {
  constructor(
    public readonly requestedUserId: string,
    public readonly entityUserId: string,
  ) {
    super('The entity does not belong to the requested user.')
    this.name = 'RepositoryOwnershipError'
  }
}

export class InvalidPersistedEntityError extends Error {
  constructor(
    public readonly entityType: string,
    public readonly field: string,
  ) {
    super(`Persisted ${entityType} has an invalid ${field}.`)
    this.name = 'InvalidPersistedEntityError'
  }
}

export class WaitingPersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'WaitingPersistenceError'
  }
}

export class TaskPersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'TaskPersistenceError'
  }
}

export class MemoPersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'MemoPersistenceError'
  }
}

export class RoutinePersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'RoutinePersistenceError'
  }
}

export class RoutineLogUniquenessError extends Error {
  constructor(routineId: EntityId, date: LocalDate) {
    super(`Routine ${routineId} already has a completion for ${date}.`)
    this.name = 'RoutineLogUniquenessError'
  }
}

export class ActivityAppendConflictError extends Error {
  constructor(id: EntityId) {
    super(`Activity ${id} already exists and cannot be changed.`)
    this.name = 'ActivityAppendConflictError'
  }
}

export class ActivityPersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'ActivityPersistenceError'
  }
}

export class DailyLogAlreadyFinalizedError extends Error {
  constructor(userId: string, date: LocalDate) {
    super(`A Daily Log for ${userId} on ${date} is already finalized.`)
    this.name = 'DailyLogAlreadyFinalizedError'
  }
}

export class DailyLogPersistenceError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'DailyLogPersistenceError'
  }
}
