import type { Task } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  TaskQuery,
  TaskRepository,
} from '@/repositories/contracts'
import {
  RepositoryVersionConflictError,
  TaskPersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

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
  constructor(private readonly database: DailyWorkDatabase) {}

  async getById(id: EntityId): Promise<Task | null> {
    try {
      const task = await this.database.tasks.get(id)
      return task && task.deletedAt === null ? cloneTask(task) : null
    } catch (error) {
      throw new TaskPersistenceError(`Task ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(query: TaskQuery): Promise<Task[]> {
    try {
      const tasks = await this.database.tasks.toArray()
      return tasks
        .filter((task) => matchesQuery(task, query))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(cloneTask)
    } catch (error) {
      throw new TaskPersistenceError('Tasks could not be queried.', {
        cause: error,
      })
    }
  }

  async save(task: Task, options: RepositoryWriteOptions = {}): Promise<void> {
    try {
      await this.database.transaction('rw', this.database.tasks, async () => {
        const current = await this.database.tasks.get(task.id)
        const versionConflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            task.version !== current.version + 1
          : options.expectedVersion !== undefined || task.version !== 1

        if (versionConflict) {
          throw new RepositoryVersionConflictError(task.id, 'Task')
        }
        await this.database.tasks.put(cloneTask(task))
      })
    } catch (error) {
      if (error instanceof RepositoryVersionConflictError) throw error
      throw new TaskPersistenceError(`Task ${task.id} could not be saved.`, {
        cause: error,
      })
    }
  }
}
