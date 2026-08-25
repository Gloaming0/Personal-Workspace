import type { Task } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  TaskQuery,
  TaskRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  RepositoryOwnershipError,
  InvalidPersistedEntityError,
  TaskPersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  assertRepositoryOwner,
  assertUserId,
  validateTask,
} from '@/repositories/validation'
import { executeDexieWrite } from './executeDexieWrite'

function cloneTask(task: Task): Task {
  return structuredClone(task)
}

function matchesQuery(task: Task, query: TaskQuery): boolean {
  return (
    task.deletedAt === null &&
    (!query.statuses || query.statuses.includes(task.status)) &&
    (!query.plannedOn || task.plannedDate === query.plannedOn) &&
    (!query.plannedOnOrBefore ||
      (task.plannedDate !== null &&
        task.plannedDate <= query.plannedOnOrBefore)) &&
    (!query.completedOn ||
      task.completedAt?.slice(0, 10) === query.completedOn) &&
    (!query.focusDate || task.focusDate === query.focusDate) &&
    (!query.projectId || task.projectId === query.projectId)
  )
}

export class DexieTaskRepository implements TaskRepository {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly table = database.tasks,
    private readonly transactionBound = false,
  ) {}

  async getById(userId: UserId, id: EntityId): Promise<Task | null> {
    try {
      assertUserId(userId)
      const task = await this.table.get(id)
      if (!task || task.userId !== userId) return null
      const validated = validateTask(task)
      return validated.deletedAt === null ? cloneTask(validated) : null
    } catch (error) {
      throw new TaskPersistenceError(`Task ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(userId: UserId, query: TaskQuery): Promise<Task[]> {
    try {
      assertUserId(userId)
      const tasks = await this.table.toArray()
      return tasks
        .filter((task) => task.userId === userId)
        .map(validateTask)
        .filter((task) => matchesQuery(task, query))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(cloneTask)
    } catch (error) {
      throw new TaskPersistenceError('Tasks could not be queried.', {
        cause: error,
      })
    }
  }

  async save(
    userId: UserId,
    task: Task,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      validateTask(task)
      assertRepositoryOwner(userId, task)
      const write = async () => {
        const current = await this.table.get(task.id)
        if (current) assertRepositoryOwner(userId, current)
        const versionConflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            task.version !== current.version + 1
          : options.expectedVersion !== undefined || task.version !== 1

        if (versionConflict) {
          throw new RepositoryVersionConflictError(task.id, 'Task')
        }
        await this.table.put(cloneTask(task))
      }
      await (this.transactionBound
        ? write()
        : executeDexieWrite(this.database, this.table, write))
    } catch (error) {
      if (
        error instanceof RepositoryVersionConflictError ||
        error instanceof RepositoryOwnershipError ||
        error instanceof InvalidPersistedEntityError
      )
        throw error
      throw new TaskPersistenceError(`Task ${task.id} could not be saved.`, {
        cause: error,
      })
    }
  }
}
