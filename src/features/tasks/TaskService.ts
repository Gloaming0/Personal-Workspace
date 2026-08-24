import {
  completeTask,
  createTask,
  removeTaskFocus,
  reopenTask,
  setTaskFocus,
  type CreateTaskInput,
} from '@/domain/task'
import type { Task } from '@/domain/entities'
import type { EntityId, Instant, LocalDate } from '@/domain/shared'
import type { TaskRepository } from '@/repositories/contracts'

export class TaskNotFoundError extends Error {
  constructor(id: EntityId) {
    super(`Task ${id} was not found.`)
    this.name = 'TaskNotFoundError'
  }
}

export class FocusLimitError extends Error {
  constructor() {
    super('Focus is limited to three tasks.')
    this.name = 'FocusLimitError'
  }
}

export interface TaskServiceDependencies {
  now?: () => Instant
  createId?: () => EntityId
}

export class TaskService {
  private readonly now: () => Instant
  private readonly createId: () => EntityId

  constructor(
    private readonly tasks: TaskRepository,
    dependencies: TaskServiceDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task = createTask(input, { id: this.createId(), now: this.now() })
    await this.tasks.save(task)
    return task
  }

  async complete(id: EntityId): Promise<Task> {
    return this.change(id, (task) => completeTask(task, this.now()))
  }

  async reopen(id: EntityId): Promise<Task> {
    return this.change(id, (task) => reopenTask(task, this.now()))
  }

  async setFocus(id: EntityId, date: LocalDate): Promise<Task> {
    const task = await this.requireTask(id)
    if (task.focusDate === date && task.focusOrder !== null) return task

    const focusedTasks = await this.tasks.find({
      focusDate: date,
      statuses: ['todo', 'doing'],
    })
    const occupiedOrders = new Set(
      focusedTasks
        .filter((focusedTask) => focusedTask.id !== id)
        .map((focusedTask) => focusedTask.focusOrder),
    )
    const order = ([1, 2, 3] as const).find(
      (candidate) => !occupiedOrders.has(candidate),
    )
    if (!order) throw new FocusLimitError()

    const focused = setTaskFocus(task, date, order, this.now())
    await this.tasks.save(focused, { expectedVersion: task.version })
    return focused
  }

  async removeFocus(id: EntityId): Promise<Task> {
    return this.change(id, (task) => removeTaskFocus(task, this.now()))
  }

  private async change(
    id: EntityId,
    update: (task: Task) => Task,
  ): Promise<Task> {
    const task = await this.requireTask(id)
    const updated = update(task)
    if (updated === task) return task
    await this.tasks.save(updated, { expectedVersion: task.version })
    return updated
  }

  private async requireTask(id: EntityId): Promise<Task> {
    const task = await this.tasks.getById(id)
    if (!task) throw new TaskNotFoundError(id)
    return task
  }
}
