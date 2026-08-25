import { describe, expect, it } from 'vitest'
import { createTask } from '@/domain/task'
import { InvalidPersistedEntityError } from './errors'
import { validateTask } from './validation'

const validTask = createTask(
  {
    userId: 'user-1',
    title: 'Validated Task',
    plannedDate: '2026-08-25',
  },
  { id: 'task-valid', now: '2026-08-25T08:00:00.000Z' },
)

describe('Repository runtime validation', () => {
  it.each([
    ['id', { id: '' }],
    ['userId', { userId: '' }],
    ['version', { version: 0 }],
    ['createdAt', { createdAt: '2026-08-25T08:00:00+08:00' }],
    ['updatedAt', { updatedAt: 'not-an-instant' }],
    ['plannedDate', { plannedDate: '2026-02-30' }],
    ['status', { status: 'unknown' }],
    ['completedAt', { completedAt: '2026-08-25' }],
  ])('rejects an invalid %s', (_field, override) => {
    expect(() => validateTask({ ...validTask, ...override })).toThrow(
      InvalidPersistedEntityError,
    )
  })
})
