import { describe, expect, it } from 'vitest'
import { createTask } from '@/domain/task'
import { createRoutine } from '@/domain/routine'
import { finalizeDailyLog } from '@/domain/dailyLog'
import { InvalidPersistedEntityError } from './errors'
import { validateDailyLog, validateRoutine, validateTask } from './validation'

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

  it('validates IANA timezone and normalized Routine schedule', () => {
    const routine = createRoutine(
      {
        userId: 'user-1',
        title: 'Schedule',
        timezone: 'Asia/Shanghai',
        schedule: { frequency: 'weekly', daysOfWeek: [1, 3] },
      },
      { id: 'routine-valid', now: '2026-08-25T08:00:00.000Z' },
    )
    expect(() => validateRoutine(routine)).not.toThrow()
    expect(() =>
      validateRoutine({ ...routine, timezone: 'Invalid/Timezone' }),
    ).toThrow(InvalidPersistedEntityError)
    expect(() =>
      validateRoutine({
        ...routine,
        schedule: { frequency: 'weekly', daysOfWeek: [1, 1] },
      }),
    ).toThrow(InvalidPersistedEntityError)
  })

  it('deeply validates DailyLog timezone and Snapshot records', () => {
    const log = finalizeDailyLog(
      {
        userId: 'user-1',
        date: '2026-08-25',
        finalizeTimezone: 'Pacific/Kiritimati',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
      },
      { id: 'log-valid', now: '2026-08-25T08:00:00.000Z' },
    )
    expect(() => validateDailyLog(log)).not.toThrow()
    expect(() =>
      validateDailyLog({ ...log, finalizeTimezone: 'UTC+14' }),
    ).toThrow(InvalidPersistedEntityError)
    expect(() =>
      validateDailyLog({
        ...log,
        snapshot: { ...log.snapshot, memos: [null] },
      }),
    ).toThrow(InvalidPersistedEntityError)
  })
})
