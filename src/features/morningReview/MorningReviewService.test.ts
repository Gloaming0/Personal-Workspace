import { describe, expect, it } from 'vitest'
import { createTask } from '@/domain/task'
import type { LocalDate, UserId } from '@/domain/shared'
import { TaskService } from '@/features/tasks/TaskService'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import type { MorningReviewSeenStore } from './contracts'
import {
  MorningReviewQuery,
  resolveMorningReviewDate,
} from './MorningReviewQuery'
import { MorningReviewService } from './MorningReviewService'

class MemorySeenStore implements MorningReviewSeenStore {
  private readonly seen = new Map<UserId, LocalDate>()
  async hasSeen(userId: UserId, date: LocalDate) {
    return this.seen.get(userId) === date
  }
  async markSeen(userId: UserId, date: LocalDate) {
    this.seen.set(userId, date)
  }
}

const userId = 'user-1'
const today = '2026-08-25'
const yesterday = '2026-08-24'
const now = '2026-08-25T08:00:00.000Z'

function task(
  id: string,
  status: 'todo' | 'doing' | 'done' | 'later' | 'archived',
  deletedAt: string | null = null,
) {
  return {
    ...createTask({ userId, title: id, plannedDate: yesterday }, { id, now }),
    status,
    completedAt: status === 'done' ? now : null,
    deletedAt,
  }
}

describe('Morning Review', () => {
  it('filters only yesterday todo/doing tasks and respects soft deletion', async () => {
    const repository = new InMemoryTaskRepository([
      task('todo', 'todo'),
      task('doing', 'doing'),
      task('done', 'done'),
      task('later', 'later'),
      task('archived', 'archived'),
      task('deleted', 'todo', now),
      { ...task('other-date', 'todo'), plannedDate: '2026-08-23' },
      { ...task('other-user', 'todo'), userId: 'user-2' },
    ])
    const review = await new MorningReviewQuery(repository).execute({
      userId,
      date: today,
      timezone: 'Asia/Shanghai',
    })
    expect(review.previousDate).toBe(yesterday)
    expect(review.tasks.map((item) => item.id)).toEqual(['todo', 'doing'])
  })

  it('runs Move to Today, Later, Done, and Delete through TaskService', async () => {
    const repository = new InMemoryTaskRepository([
      task('move', 'todo'),
      task('later', 'doing'),
      task('done', 'todo'),
      task('delete', 'todo'),
    ])
    const service = new MorningReviewService(
      new MorningReviewQuery(repository),
      new TaskService(repository, { now: () => now }),
      new MemorySeenStore(),
    )
    const input = { userId, date: today, timezone: 'Asia/Shanghai' }
    await service.apply(input, 'move', 'today')
    await service.apply(input, 'later', 'later')
    await service.apply(input, 'done', 'done')
    await service.apply(input, 'delete', 'delete')
    await expect(repository.getById(userId, 'move')).resolves.toMatchObject({
      plannedDate: today,
      status: 'todo',
    })
    await expect(repository.getById(userId, 'later')).resolves.toMatchObject({
      status: 'later',
      focusDate: null,
    })
    await expect(repository.getById(userId, 'done')).resolves.toMatchObject({
      status: 'done',
      completedAt: now,
    })
    await expect(repository.getById(userId, 'delete')).resolves.toBeNull()
    await expect(service.load(input)).resolves.toBeNull()
  })

  it('moves all without duplicating tasks and Skip changes no Task', async () => {
    const repository = new InMemoryTaskRepository([
      task('one', 'todo'),
      task('two', 'doing'),
    ])
    const seen = new MemorySeenStore()
    const service = new MorningReviewService(
      new MorningReviewQuery(repository),
      new TaskService(repository, { now: () => now }),
      seen,
    )
    const input = { userId, date: today, timezone: 'UTC' }
    await service.moveAll(input)
    expect(await repository.find(userId, { plannedOn: today })).toHaveLength(2)
    expect(await repository.find(userId, {})).toHaveLength(2)
    await expect(service.load(input)).resolves.toBeNull()

    const nextDay = { ...input, date: '2026-08-26' }
    const beforeSkip = await repository.find(userId, {})
    expect(await service.load(nextDay)).not.toBeNull()
    await service.skip(nextDay)
    expect(await repository.find(userId, {})).toEqual(beforeSkip)
    await expect(service.load(nextDay)).resolves.toBeNull()
  })

  it('shows again on the next local date and resolves timezone boundaries', async () => {
    expect(
      resolveMorningReviewDate('2026-08-24T16:30:00.000Z', 'Asia/Shanghai'),
    ).toBe('2026-08-25')
    expect(
      resolveMorningReviewDate(
        '2026-08-24T16:30:00.000Z',
        'America/Los_Angeles',
      ),
    ).toBe('2026-08-24')

    const repository = new InMemoryTaskRepository([task('yesterday', 'todo')])
    const service = new MorningReviewService(
      new MorningReviewQuery(repository),
      new TaskService(repository),
      new MemorySeenStore(),
    )
    const firstDay = { userId, date: today, timezone: 'Asia/Shanghai' }
    expect(await service.load(firstDay)).not.toBeNull()
    await service.skip(firstDay)
    await new TaskService(repository, {
      createId: () => 'today-task',
      now: () => now,
    }).create({ userId, title: 'Today carryover', plannedDate: today })
    await expect(
      service.load({ ...firstDay, date: '2026-08-26' }),
    ).resolves.toMatchObject({
      previousDate: today,
      tasks: [expect.objectContaining({ id: 'today-task' })],
    })
  })
})
