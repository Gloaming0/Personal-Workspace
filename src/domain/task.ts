import type { Task, TaskPriority, TaskStatus } from './entities'
import type { EntityId, Instant, LocalDate, UserId } from './shared'
import { taskTransitions } from './transitions'

export type TaskRuleErrorCode =
  'empty_title' | 'invalid_transition' | 'focus_ineligible'

export class TaskRuleError extends Error {
  constructor(public readonly code: TaskRuleErrorCode) {
    super(code)
    this.name = 'TaskRuleError'
  }
}

export interface CreateTaskInput {
  userId: UserId
  title: string
  notes?: string | null
  priority?: TaskPriority
  plannedDate: LocalDate
  dueAt?: Instant | null
  projectId?: EntityId | null
}

interface CreateTaskContext {
  id: EntityId
  now: Instant
}

function changed(task: Task, now: Instant, fields: Partial<Task>): Task {
  return {
    ...task,
    ...fields,
    updatedAt: now,
    version: task.version + 1,
  }
}

export function createTask(
  input: CreateTaskInput,
  context: CreateTaskContext,
): Task {
  const title = input.title.trim()
  if (!title) throw new TaskRuleError('empty_title')

  return {
    id: context.id,
    userId: input.userId,
    title,
    notes: input.notes?.trim() || null,
    status: 'todo',
    priority: input.priority ?? 'P2',
    plannedDate: input.plannedDate,
    dueAt: input.dueAt ?? null,
    projectId: input.projectId ?? null,
    focusDate: null,
    focusOrder: null,
    completedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}

export function transitionTask(
  task: Task,
  nextStatus: TaskStatus,
  now: Instant,
): Task {
  const allowedTransitions = taskTransitions[
    task.status
  ] as readonly TaskStatus[]
  if (!allowedTransitions.includes(nextStatus)) {
    throw new TaskRuleError('invalid_transition')
  }

  const cannotStayFocused = ['done', 'later', 'archived'].includes(nextStatus)
  return changed(task, now, {
    status: nextStatus,
    completedAt: nextStatus === 'done' ? now : null,
    focusDate: cannotStayFocused ? null : task.focusDate,
    focusOrder: cannotStayFocused ? null : task.focusOrder,
  })
}

export function completeTask(task: Task, now: Instant): Task {
  return transitionTask(task, 'done', now)
}

export function reopenTask(task: Task, now: Instant): Task {
  if (task.status !== 'done') throw new TaskRuleError('invalid_transition')
  return transitionTask(task, 'todo', now)
}

export function setTaskFocus(
  task: Task,
  date: LocalDate,
  order: 1 | 2 | 3,
  now: Instant,
): Task {
  if (task.status !== 'todo' && task.status !== 'doing') {
    throw new TaskRuleError('focus_ineligible')
  }
  return changed(task, now, { focusDate: date, focusOrder: order })
}

export function removeTaskFocus(task: Task, now: Instant): Task {
  if (task.focusDate === null && task.focusOrder === null) return task
  return changed(task, now, { focusDate: null, focusOrder: null })
}
