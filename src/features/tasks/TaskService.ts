import {
  completeTask,
  createTask,
  removeTaskFocus,
  moveTaskToLater,
  moveTaskToTomorrow,
  reopenTask,
  setTaskFocus,
  softDeleteTask,
  type CreateTaskInput,
} from '@/domain/task'
import type { Task } from '@/domain/entities'
import type { EntityId, Instant, LocalDate } from '@/domain/shared'
import type { TaskRepository } from '@/repositories/contracts'
import { ActivityService } from '@/features/activity/ActivityService'

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
    private readonly activities?: ActivityService,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const task = createTask(input, { id: this.createId(), now: this.now() })
    await this.tasks.save(task)
    await this.record(task, 'task_created')
    return task
  }

  async complete(id: EntityId): Promise<Task> {
    const task = await this.change(id, (entity) =>
      completeTask(entity, this.now()),
    )
    await this.record(task, 'task_completed')
    return task
  }

  async reopen(id: EntityId): Promise<Task> {
    const task = await this.change(id, (entity) =>
      reopenTask(entity, this.now()),
    )
    await this.record(task, 'task_reopened')
    return task
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
    await this.record(focused, 'task_focus_set')
    return focused
  }

  async removeFocus(id: EntityId): Promise<Task> {
    const task = await this.requireTask(id)
    const updated = removeTaskFocus(task, this.now())
    if (updated === task) return task
    await this.tasks.save(updated, { expectedVersion: task.version })
    await this.record(updated, 'task_focus_removed')
    return updated
  }

  moveToTomorrow(id: EntityId, date: LocalDate): Promise<Task> {
    return this.change(id, (entity) =>
      moveTaskToTomorrow(entity, date, this.now()),
    )
  }

  moveToLater(id: EntityId): Promise<Task> {
    return this.change(id, (entity) => moveTaskToLater(entity, this.now()))
  }

  delete(id: EntityId): Promise<Task> {
    return this.change(id, (entity) => softDeleteTask(entity, this.now()))
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

  private async record(
    task: Task,
    eventType:
      | 'task_created'
      | 'task_completed'
      | 'task_reopened'
      | 'task_focus_set'
      | 'task_focus_removed',
  ): Promise<void> {
    await this.activities?.record({
      userId: task.userId,
      eventType,
      entityType: 'task',
      entityId: task.id,
      title: task.title,
      projectId: task.projectId,
    })
  }
}
