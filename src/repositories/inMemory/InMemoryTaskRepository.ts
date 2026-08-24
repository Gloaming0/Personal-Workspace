import type { Task } from '@/domain/entities'
import type { EntityId } from '@/domain/shared'
import type {
  RepositoryWriteOptions,
  TaskQuery,
  TaskRepository,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'

function cloneTask(task: Task): Task {
  return structuredClone(task)
}

export class InMemoryTaskRepository implements TaskRepository {
  private readonly tasks = new Map<EntityId, Task>()

  constructor(seed: readonly Task[] = []) {
    seed.forEach((task) => this.tasks.set(task.id, cloneTask(task)))
  }

  async getById(id: EntityId): Promise<Task | null> {
    const task = this.tasks.get(id)
    return task && task.deletedAt === null ? cloneTask(task) : null
  }

  async find(query: TaskQuery): Promise<Task[]> {
    return [...this.tasks.values()]
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

  async save(task: Task, options: RepositoryWriteOptions = {}): Promise<void> {
    const current = this.tasks.get(task.id)
    if (
      options.expectedVersion !== undefined &&
      current?.version !== options.expectedVersion
    ) {
      throw new RepositoryVersionConflictError(task.id)
    }
    this.tasks.set(task.id, cloneTask(task))
  }
}
