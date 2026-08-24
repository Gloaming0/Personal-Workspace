import type {
  ProjectStatus,
  RoutineStatus,
  TaskStatus,
  WaitingStatus,
} from './entities'

export const taskTransitions = {
  todo: ['doing', 'done', 'later', 'archived'],
  doing: ['todo', 'done', 'later', 'archived'],
  later: ['todo', 'doing', 'done', 'archived'],
  done: ['todo', 'archived'],
  archived: ['todo'],
} as const satisfies Record<TaskStatus, readonly TaskStatus[]>

export const waitingTransitions = {
  waiting: ['confirmed', 'closed'],
  confirmed: ['waiting', 'closed'],
  closed: ['waiting'],
} as const satisfies Record<WaitingStatus, readonly WaitingStatus[]>

export const routineTransitions = {
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: ['active'],
} as const satisfies Record<RoutineStatus, readonly RoutineStatus[]>

export const projectTransitions = {
  active: ['paused', 'completed', 'archived'],
  paused: ['active', 'completed', 'archived'],
  completed: ['active', 'archived'],
  archived: ['active'],
} as const satisfies Record<ProjectStatus, readonly ProjectStatus[]>
