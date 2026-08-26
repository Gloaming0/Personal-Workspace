import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { finalizeDailyLog } from '@/domain/dailyLog'
import { createRoutineLog } from '@/domain/routineLog'
import { createTask, setTaskFocus } from '@/domain/task'
import { DailyWorkDatabase, initializeLocalDatabase } from './DailyWorkDatabase'

const NOW = '2026-08-25T08:00:00.000Z'
const USER = 'integrity-user'

let sequence = 0
describe('database integrity checks', () => {
  const connections: Dexie[] = []
  let name = ''

  afterEach(async () => {
    connections.forEach((connection) => connection.close())
    if (name) await Dexie.delete(name)
  })

  it('detects duplicate effective invariants without destructive repair', async () => {
    name = `integrity-invariants-${++sequence}`
    const seed = new DailyWorkDatabase(name)
    connections.push(seed)
    await seed.open()
    const firstTask = setTaskFocus(
      createTask(
        { userId: USER, title: 'one', plannedDate: '2026-08-25' },
        { id: 'focus-one', now: NOW },
      ),
      '2026-08-25',
      1,
      NOW,
    )
    const secondTask = setTaskFocus(
      createTask(
        { userId: USER, title: 'two', plannedDate: '2026-08-25' },
        { id: 'focus-two', now: NOW },
      ),
      '2026-08-25',
      1,
      NOW,
    )
    const routineLog = createRoutineLog(
      { userId: USER, routineId: 'routine-one', date: '2026-08-25' },
      { id: 'routine-log-one', now: NOW },
    )
    const dailyLog = finalizeDailyLog(
      {
        userId: USER,
        date: '2026-08-25',
        finalizeTimezone: 'UTC',
        snapshot: {
          completedTasks: [],
          openTasks: [],
          waiting: [],
          memos: [],
          routines: [],
        },
      },
      { id: 'daily-log-one', now: NOW },
    )
    await seed.tasks.bulkAdd([firstTask, secondTask])
    await seed.routine_logs.bulkAdd([
      routineLog,
      { ...routineLog, id: 'routine-log-two' },
    ])
    await seed.daily_logs.bulkAdd([
      dailyLog,
      { ...dailyLog, id: 'daily-log-two' },
    ])
    seed.close()

    const checked = new DailyWorkDatabase(name)
    connections.push(checked)
    await initializeLocalDatabase(checked)

    expect(checked.runtime.getSnapshot()).toMatchObject({
      status: 'recovery-required',
      errorCategory: 'integrity-violation',
    })
    const stores = checked.runtime
      .diagnostics()
      .filter((entry) => entry.errorCategory === 'integrity-violation')
      .map((entry) => entry.storeName)
    expect(stores).toEqual(['tasks', 'routine_logs', 'daily_logs'])
    await expect(checked.tasks.count()).resolves.toBe(2)
    await expect(checked.routine_logs.count()).resolves.toBe(2)
    await expect(checked.daily_logs.count()).resolves.toBe(2)
  })

  it('isolates corrupt records and emits content-free diagnostics', async () => {
    name = `integrity-corrupt-${++sequence}`
    const seed = new DailyWorkDatabase(name)
    connections.push(seed)
    await seed.open()
    const corrupt = createTask(
      { userId: USER, title: 'private title', plannedDate: '2026-08-25' },
      { id: 'corrupt-task', now: NOW },
    )
    await seed.tasks.add({
      ...corrupt,
      version: 0,
      plannedDate: '2026-13-40',
      updatedAt: 'not-an-instant',
    })
    seed.close()

    const checked = new DailyWorkDatabase(name)
    connections.push(checked)
    await initializeLocalDatabase(checked)

    expect(checked.runtime.getSnapshot().status).toBe('ready')
    const diagnostics = checked.runtime.diagnostics()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      databaseVersion: 8,
      storeName: 'tasks',
      errorCategory: 'corrupt-record',
    })
    expect(JSON.stringify(diagnostics)).not.toContain('private title')
    await expect(checked.tasks.count()).resolves.toBe(1)
  })
})
