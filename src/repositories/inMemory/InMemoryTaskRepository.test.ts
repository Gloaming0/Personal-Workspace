import { describe, expect, it } from 'vitest'
import { createTask } from '@/domain/task'
import { InMemoryTaskRepository } from './InMemoryTaskRepository'
import { RepositoryVersionConflictError } from '@/repositories/errors'

describe('InMemoryTaskRepository', () => {
  const task = createTask(
    {
      userId: 'user-1',
      title: 'Repository task',
      plannedDate: '2026-08-24',
    },
    { id: 'task-1', now: '2026-08-24T08:00:00.000Z' },
  )

  it('filters Task queries and isolates stored entities from callers', async () => {
    const repository = new InMemoryTaskRepository([task])
    const result = await repository.find('user-1', {
      plannedOn: '2026-08-24',
    })
    result[0]!.title = 'Caller mutation'

    await expect(repository.getById('user-1', task.id)).resolves.toMatchObject({
      title: 'Repository task',
    })
    await expect(
      repository.find('user-1', { plannedOn: '2026-08-25' }),
    ).resolves.toHaveLength(0)
  })

  it('rejects writes based on a stale expected version', async () => {
    const repository = new InMemoryTaskRepository([task])

    await expect(
      repository.save(
        'user-1',
        { ...task, title: 'Stale write', version: 2 },
        { expectedVersion: 0 },
      ),
    ).rejects.toBeInstanceOf(RepositoryVersionConflictError)
  })
})
