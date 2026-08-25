import type { DailyWorkDatabase } from './DailyWorkDatabase'
import {
  validateActivity,
  validateDailyLog,
  validateMemo,
  validateRoutine,
  validateRoutineLog,
  validateTask,
  validateWaiting,
} from '@/repositories/validation'
import { InvalidPersistedEntityError } from '@/repositories/errors'

function isolateInvalid<T>(
  database: DailyWorkDatabase,
  storeName: string,
  rows: readonly unknown[],
  validate: (value: unknown) => T,
): T[] {
  const valid: T[] = []
  for (const row of rows) {
    try {
      valid.push(validate(row))
    } catch (error) {
      if (!(error instanceof InvalidPersistedEntityError)) throw error
      database.runtime.corruptRecord(storeName)
    }
  }
  return valid
}

function containsDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length
}

export async function checkDatabaseIntegrity(
  database: DailyWorkDatabase,
): Promise<boolean> {
  const [tasks, waiting, memos, routines, routineLogs, activities, dailyLogs] =
    await Promise.all([
      database.tasks.toArray(),
      database.confirmations.toArray(),
      database.memos.toArray(),
      database.routines.toArray(),
      database.routine_logs.toArray(),
      database.activities.toArray(),
      database.daily_logs.toArray(),
    ])

  const validTasks = isolateInvalid(database, 'tasks', tasks, validateTask)
  isolateInvalid(database, 'confirmations', waiting, validateWaiting)
  isolateInvalid(database, 'memos', memos, validateMemo)
  isolateInvalid(database, 'routines', routines, validateRoutine)
  const validRoutineLogs = isolateInvalid(
    database,
    'routine_logs',
    routineLogs,
    validateRoutineLog,
  )
  isolateInvalid(database, 'activities', activities, validateActivity)
  const validDailyLogs = isolateInvalid(
    database,
    'daily_logs',
    dailyLogs,
    validateDailyLog,
  )

  let valid = true
  const focusGroups = new Map<string, string[]>()
  for (const task of validTasks) {
    if (
      task.deletedAt !== null ||
      task.focusDate === null ||
      task.focusOrder === null ||
      !['todo', 'doing'].includes(task.status)
    )
      continue
    const key = `${task.userId}:${task.focusDate}`
    const slots = focusGroups.get(key) ?? []
    slots.push(String(task.focusOrder))
    focusGroups.set(key, slots)
  }
  if (
    [...focusGroups.values()].some(
      (slots) => slots.length > 3 || containsDuplicate(slots),
    )
  ) {
    database.runtime.integrityViolation('tasks')
    valid = false
  }

  const effectiveRoutineLogs = validRoutineLogs
    .filter((log) => log.deletedAt === null)
    .map((log) => `${log.userId}:${log.routineId}:${log.date}`)
  if (containsDuplicate(effectiveRoutineLogs)) {
    database.runtime.integrityViolation('routine_logs')
    valid = false
  }

  const effectiveDailyLogs = validDailyLogs
    .filter((log) => log.deletedAt === null)
    .map((log) => `${log.userId}:${log.date}`)
  if (containsDuplicate(effectiveDailyLogs)) {
    database.runtime.integrityViolation('daily_logs')
    valid = false
  }
  return valid
}
