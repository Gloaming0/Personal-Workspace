import type { EntityId } from '@/domain/shared'

export class RepositoryVersionConflictError extends Error {
  constructor(id: EntityId, entityName = 'Entity') {
    super(`${entityName} ${id} was changed by another operation.`)
    this.name = 'RepositoryVersionConflictError'
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
