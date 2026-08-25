import type { Task } from '@/domain/entities'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  TaskQuery,
  TaskRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateTask,
} from '@/repositories/validation'
import {
  createMapSnapshot,
  restoreMapSnapshot,
  type InMemoryTransactionalStore,
} from '@/unitOfWork/inMemory/transactionalStore'

function cloneTask(task: Task): Task {
  return structuredClone(task)
}

export class InMemoryTaskRepository
  implements TaskRepository, InMemoryTransactionalStore
{
  private readonly tasks = new Map<EntityId, Task>()

  constructor(seed: readonly Task[] = []) {
    seed.forEach((task) => this.tasks.set(task.id, cloneTask(task)))
  }

  createTransactionSnapshot(): unknown {
    return createMapSnapshot(this.tasks)
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    restoreMapSnapshot(this.tasks, snapshot)
  }

  async getById(userId: UserId, id: EntityId): Promise<Task | null> {
    assertUserId(userId)
    const task = this.tasks.get(id)
    if (!task || task.userId !== userId) return null
    const validated = validateTask(task)
    return validated.deletedAt === null ? cloneTask(validated) : null
  }

  async find(userId: UserId, query: TaskQuery): Promise<Task[]> {
    assertUserId(userId)
    return [...this.tasks.values()]
      .filter((task) => task.userId === userId)
      .map(validateTask)
      .filter((task) => task.deletedAt === null)
      .filter((task) => !query.statuses || query.statuses.includes(task.status))
      .filter(
        (task) => !query.plannedOn || task.plannedDate === query.plannedOn,
      )
      .filter(
        (task) =>
          !query.plannedOnOrBefore ||
          (task.plannedDate !== null &&
            task.plannedDate <= query.plannedOnOrBefore),
      )
      .filter(
        (task) =>
          !query.completedOn ||
          task.completedAt?.slice(0, 10) === query.completedOn,
      )
      .filter((task) => !query.focusDate || task.focusDate === query.focusDate)
      .filter((task) => !query.projectId || task.projectId === query.projectId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneTask)
  }

  async save(
    userId: UserId,
    task: Task,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    validateTask(task)
    assertRepositoryOwner(userId, task)
    const current = this.tasks.get(task.id)
    if (current) assertRepositoryOwner(userId, current)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        task.version !== current.version + 1
      : options.expectedVersion !== undefined || task.version !== 1
    if (conflict) {
      throw new RepositoryVersionConflictError(task.id, 'Task')
    }
    this.tasks.set(task.id, cloneTask(task))
  }
}
