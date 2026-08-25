import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { InvalidPersistedEntityError } from '@/repositories/errors'

export function validatePersistedRows<T>(
  database: DailyWorkDatabase,
  storeName: string,
  rows: readonly unknown[],
  validate: (row: unknown) => T,
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
