import type { Table } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { classifyDatabaseError } from '@/database/runtimeState'

export async function executeDexieWrite<T>(
  database: DailyWorkDatabase,
  tables: Table | readonly Table[],
  command: () => Promise<T>,
): Promise<T> {
  database.runtime.assertWritable()
  try {
    if (Array.isArray(tables))
      return await database.transaction(
        'rw',
        tables as readonly Table[],
        command,
      )
    return await database.transaction('rw', tables as Table, command)
  } catch (error) {
    if (classifyDatabaseError(error) !== 'unknown') {
      database.runtime.failure(error, {
        storeName: Array.isArray(tables)
          ? tables.map((table) => table.name).join(',')
          : (tables as Table).name,
      })
    }
    throw error
  }
}
