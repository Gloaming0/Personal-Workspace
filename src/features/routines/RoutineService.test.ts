import { describe, expect, it } from 'vitest'
import { createRoutineLog } from '@/domain/routineLog'
import { isRoutineScheduledOn } from '@/domain/routine'
import { InMemoryRoutineRepository } from '@/repositories/inMemory/InMemoryRoutineRepository'
import { InMemoryRoutineLogRepository } from '@/repositories/inMemory/InMemoryRoutineLogRepository'
import { RoutineLogUniquenessError } from '@/repositories/errors'
import { RoutineService } from './RoutineService'

describe('Routine schedule', () => {
  it('supports daily, weekdays, and weekly daysOfWeek', () => {
    expect(isRoutineScheduledOn({ frequency: 'daily' }, '2026-08-23')).toBe(
      true,
    )
    expect(isRoutineScheduledOn({ frequency: 'weekdays' }, '2026-08-24')).toBe(
      true,
    )
    expect(isRoutineScheduledOn({ frequency: 'weekdays' }, '2026-08-23')).toBe(
      false,
    )
    expect(
      isRoutineScheduledOn(
        { frequency: 'weekly', daysOfWeek: [1, 3] },
        '2026-08-24',
      ),
    ).toBe(true)
    expect(
      isRoutineScheduledOn(
        { frequency: 'weekly', daysOfWeek: [2] },
        '2026-08-24',
      ),
    ).toBe(false)
  })
})

describe('RoutineService', () => {
  it('completes and undoes with one effective log per user/routine/date', async () => {
    const routines = new InMemoryRoutineRepository()
    const logs = new InMemoryRoutineLogRepository()
    let id = 0
    let tick = 0
    const service = new RoutineService(routines, logs, {
      createId: () => `entity-${++id}`,
      now: () => `2026-08-24T10:00:0${tick++}.000Z`,
    })
    const routine = await service.create({
      userId: 'user-1',
      title: 'Daily review',
      schedule: { frequency: 'daily' },
      timezone: 'Asia/Shanghai',
    })

    const completed = await service.complete('user-1', routine.id, '2026-08-24')
    await expect(
      service.complete('user-1', routine.id, '2026-08-24'),
    ).resolves.toEqual(completed)
    await expect(
      logs.save(
        'user-1',
        createRoutineLog(
          { userId: 'user-1', routineId: routine.id, date: '2026-08-24' },
          { id: 'duplicate', now: '2026-08-24T11:00:00.000Z' },
        ),
      ),
    ).rejects.toBeInstanceOf(RoutineLogUniquenessError)

    await service.undo('user-1', routine.id, '2026-08-24')
    await expect(
      logs.findByRoutineAndDate('user-1', routine.id, '2026-08-24'),
    ).resolves.toBeNull()
    const completedAgain = await service.complete(
      'user-1',
      routine.id,
      '2026-08-24',
    )
    expect(completedAgain.id).not.toBe(completed.id)
  })

  it('excludes paused and archived routines from active queries and can resume', async () => {
    const routines = new InMemoryRoutineRepository()
    const logs = new InMemoryRoutineLogRepository()
    const service = new RoutineService(routines, logs, {
      createId: () => 'routine-state',
      now: () => '2026-08-24T10:00:00.000Z',
    })
    const routine = await service.create({
      userId: 'user-1',
      title: 'State routine',
      schedule: { frequency: 'daily' },
      timezone: 'UTC',
    })
    await service.pause('user-1', routine.id)
    await expect(routines.findByStatus('user-1', ['active'])).resolves.toEqual(
      [],
    )
    await service.resume('user-1', routine.id)
    await expect(
      routines.findByStatus('user-1', ['active']),
    ).resolves.toHaveLength(1)
    await service.archive('user-1', routine.id)
    await expect(routines.findByStatus('user-1', ['active'])).resolves.toEqual(
      [],
    )
  })
})
