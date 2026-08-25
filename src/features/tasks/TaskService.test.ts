import { beforeEach, describe, expect, it } from 'vitest'
import { TaskRuleError, transitionTask } from '@/domain/task'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { FocusLimitError, TaskService } from './TaskService'
import { InMemoryUnitOfWork } from '@/unitOfWork/inMemory/InMemoryUnitOfWork'

const today = '2026-08-24'
const userId = 'user-1'

describe('Task vertical slice domain rules', () => {
  let repository: InMemoryTaskRepository
  let service: TaskService
  let idSequence: number
  let timeSequence: number

  beforeEach(() => {
    repository = new InMemoryTaskRepository()
    idSequence = 0
    timeSequence = 0
    service = new TaskService(
      repository,
      new InMemoryUnitOfWork({ tasks: repository }),
      {
        createId: () => `task-${++idSequence}`,
        now: () => `2026-08-24T10:00:0${timeSequence++}.000Z`,
      },
    )
  })

  async function create(title: string) {
    return service.create({ userId, title, plannedDate: today })
  }

  it('creates a todo Task with raw trimmed user content', async () => {
    const task = await create('  Write launch note  ')

    expect(task).toMatchObject({
      id: 'task-1',
      title: 'Write launch note',
      status: 'todo',
      completedAt: null,
      focusDate: null,
      version: 1,
    })
    await expect(repository.getById(userId, task.id)).resolves.toEqual(task)
  })

  it('completes and reopens a Task with correct completion metadata', async () => {
    const task = await create('Prepare review')
    const completed = await service.complete(userId, task.id)

    expect(completed.status).toBe('done')
    expect(completed.completedAt).toBe(completed.updatedAt)

    const reopened = await service.reopen(userId, task.id)
    expect(reopened.status).toBe('todo')
    expect(reopened.completedAt).toBeNull()
  })

  it('limits Focus to three eligible Tasks', async () => {
    const tasks = await Promise.all(
      ['One', 'Two', 'Three', 'Four'].map((title) => create(title)),
    )
    await service.setFocus(userId, tasks[0]!.id, today)
    await service.setFocus(userId, tasks[1]!.id, today)
    await service.setFocus(userId, tasks[2]!.id, today)

    await expect(
      service.setFocus(userId, tasks[3]!.id, today),
    ).rejects.toBeInstanceOf(FocusLimitError)
    await expect(
      repository.find(userId, { focusDate: today }),
    ).resolves.toHaveLength(3)
  })

  it('automatically removes a focused Task when completed', async () => {
    const task = await create('Focused work')
    await service.setFocus(userId, task.id, today)
    const completed = await service.complete(userId, task.id)

    expect(completed).toMatchObject({
      status: 'done',
      focusDate: null,
      focusOrder: null,
    })
    await expect(
      repository.find(userId, { focusDate: today }),
    ).resolves.toHaveLength(0)
  })

  it('rejects Focus for done Tasks and supports explicit removal', async () => {
    const task = await create('Focus rules')
    await service.setFocus(userId, task.id, today)
    const removed = await service.removeFocus(userId, task.id)
    expect(removed.focusDate).toBeNull()

    await service.complete(userId, task.id)
    await expect(
      service.setFocus(userId, task.id, today),
    ).rejects.toMatchObject({
      code: 'focus_ineligible',
    } satisfies Partial<TaskRuleError>)
  })

  it('normalizes Focus away from later and archived states', async () => {
    const task = await create('State normalization')
    const focused = await service.setFocus(userId, task.id, today)

    expect(
      transitionTask(focused, 'later', '2026-08-24T11:00:00.000Z'),
    ).toMatchObject({ status: 'later', focusDate: null, focusOrder: null })
    expect(
      transitionTask(focused, 'archived', '2026-08-24T11:00:00.000Z'),
    ).toMatchObject({ status: 'archived', focusDate: null, focusOrder: null })
  })
})
