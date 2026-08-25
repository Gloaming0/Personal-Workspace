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
import type { EntityId, Instant, LocalDate, UserId } from '@/domain/shared'
import type { TaskRepository } from '@/repositories/contracts'
import { ActivityService } from '@/features/activity/ActivityService'
import {
  executeAtomic,
  type UnitOfWork,
  type UnitOfWorkStore,
  type UnitOfWorkTransaction,
} from '@/unitOfWork/contracts'

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
    private readonly unitOfWork: UnitOfWork,
    dependencies: TaskServiceDependencies = {},
    private readonly activities?: ActivityService,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async create(input: CreateTaskInput): Promise<Task> {
    return this.atomic(async (transaction) => {
      const tasks = transaction.repository('tasks')
      const task = createTask(input, { id: this.createId(), now: this.now() })
      await tasks.save(input.userId, task)
      await this.record(task, 'task_created', transaction)
      return task
    })
  }

  complete(
    userId: UserId,
    id: EntityId,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.changeAndRecord(
      userId,
      id,
      (entity) => completeTask(entity, this.now()),
      'task_completed',
      transaction,
    )
  }

  reopen(
    userId: UserId,
    id: EntityId,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.changeAndRecord(
      userId,
      id,
      (entity) => reopenTask(entity, this.now()),
      'task_reopened',
      transaction,
    )
  }

  setFocus(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(async (activeTransaction) => {
      const tasks = activeTransaction.repository('tasks')
      const task = await this.requireTask(tasks, userId, id)
      if (task.focusDate === date && task.focusOrder !== null) return task

      const focusedTasks = await tasks.find(userId, {
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
      await tasks.save(userId, focused, { expectedVersion: task.version })
      await this.record(focused, 'task_focus_set', activeTransaction)
      return focused
    }, transaction)
  }

  removeFocus(
    userId: UserId,
    id: EntityId,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(async (activeTransaction) => {
      const tasks = activeTransaction.repository('tasks')
      const task = await this.requireTask(tasks, userId, id)
      const updated = removeTaskFocus(task, this.now())
      if (updated === task) return task
      await tasks.save(userId, updated, { expectedVersion: task.version })
      await this.record(updated, 'task_focus_removed', activeTransaction)
      return updated
    }, transaction)
  }

  moveToTomorrow(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.moveToDate(userId, id, date, transaction)
  }

  moveToDate(
    userId: UserId,
    id: EntityId,
    date: LocalDate,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(
      (activeTransaction) =>
        this.change(
          activeTransaction.repository('tasks'),
          userId,
          id,
          (entity) => moveTaskToTomorrow(entity, date, this.now()),
        ),
      transaction,
      false,
    )
  }

  moveToLater(
    userId: UserId,
    id: EntityId,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(
      (activeTransaction) =>
        this.change(
          activeTransaction.repository('tasks'),
          userId,
          id,
          (entity) => moveTaskToLater(entity, this.now()),
        ),
      transaction,
      false,
    )
  }

  delete(
    userId: UserId,
    id: EntityId,
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(
      (activeTransaction) =>
        this.change(
          activeTransaction.repository('tasks'),
          userId,
          id,
          (entity) => softDeleteTask(entity, this.now()),
        ),
      transaction,
      false,
    )
  }

  private changeAndRecord(
    userId: UserId,
    id: EntityId,
    update: (task: Task) => Task,
    eventType: 'task_completed' | 'task_reopened',
    transaction?: UnitOfWorkTransaction,
  ): Promise<Task> {
    return this.atomic(async (activeTransaction) => {
      const task = await this.change(
        activeTransaction.repository('tasks'),
        userId,
        id,
        update,
      )
      await this.record(task, eventType, activeTransaction)
      return task
    }, transaction)
  }

  private atomic<T>(
    command: (transaction: UnitOfWorkTransaction) => Promise<T>,
    transaction?: UnitOfWorkTransaction,
    includeActivity = true,
  ): Promise<T> {
    const stores: UnitOfWorkStore[] = ['tasks']
    if (includeActivity && this.activities) stores.push('activities')
    return executeAtomic(this.unitOfWork, stores, command, transaction)
  }

  private async change(
    tasks: TaskRepository,
    userId: UserId,
    id: EntityId,
    update: (task: Task) => Task,
  ): Promise<Task> {
    const task = await this.requireTask(tasks, userId, id)
    const updated = update(task)
    if (updated === task) return task
    await tasks.save(userId, updated, { expectedVersion: task.version })
    return updated
  }

  private async requireTask(
    tasks: TaskRepository,
    userId: UserId,
    id: EntityId,
  ): Promise<Task> {
    const task = await tasks.getById(userId, id)
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
    transaction: UnitOfWorkTransaction,
  ): Promise<void> {
    if (this.activities)
      await this.activities.record(
        {
          userId: task.userId,
          eventType,
          entityType: 'task',
          entityId: task.id,
          title: task.title,
          projectId: task.projectId,
        },
        transaction.repository('activities'),
      )
  }
}
