import { format, set } from 'date-fns'
import {
  completeTask,
  createTask,
  setTaskFocus,
  type CreateTaskInput,
} from '@/domain/task'
import type { Task } from '@/domain/entities'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { TaskService } from './TaskService'

const demoUserId = 'local-demo-user'

function seedTask(
  input: Omit<CreateTaskInput, 'userId' | 'plannedDate'>,
  id: string,
  plannedDate: string,
  createdAt: string,
): Task {
  return createTask(
    { ...input, userId: demoUserId, plannedDate },
    { id, now: createdAt },
  )
}

export function createTaskSeed(now = new Date()): Task[] {
  const date = format(now, 'yyyy-MM-dd')
  const timestamps = [8, 8, 9, 9].map((hour, index) =>
    set(now, {
      hours: hour,
      minutes: index * 10,
      seconds: 0,
      milliseconds: 0,
    }).toISOString(),
  )
  const dueAt = (hours: number, minutes = 0) =>
    set(now, { hours, minutes, seconds: 0, milliseconds: 0 }).toISOString()

  const first = setTaskFocus(
    seedTask(
      {
        title: 'Review player retention data',
        priority: 'P1',
        dueAt: dueAt(10),
      },
      'task-retention-review',
      date,
      timestamps[0]!,
    ),
    date,
    1,
    timestamps[0]!,
  )
  const second = setTaskFocus(
    seedTask(
      {
        title: 'Update event configuration',
        priority: 'P2',
        dueAt: dueAt(13, 30),
      },
      'task-event-configuration',
      date,
      timestamps[1]!,
    ),
    date,
    2,
    timestamps[1]!,
  )
  const completed = completeTask(
    seedTask(
      {
        title: 'Send proposal for review',
        priority: 'P2',
        dueAt: dueAt(9),
      },
      'task-send-proposal',
      date,
      timestamps[2]!,
    ),
    timestamps[2]!,
  )
  const fourth = seedTask(
    {
      title: 'Prepare afternoon sync notes',
      priority: 'P2',
      dueAt: dueAt(16),
    },
    'task-sync-notes',
    date,
    timestamps[3]!,
  )

  return [first, second, completed, fourth]
}

export function createTaskRuntime() {
  const repository = new InMemoryTaskRepository(createTaskSeed())
  return {
    repository,
    service: new TaskService(repository),
  }
}

export type TaskRuntime = ReturnType<typeof createTaskRuntime>
export { demoUserId }
