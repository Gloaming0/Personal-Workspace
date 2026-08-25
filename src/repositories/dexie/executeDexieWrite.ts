import type { Table } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

export function executeDexieWrite<T>(
  database: DailyWorkDatabase,
  tables: Table | readonly Table[],
  command: () => Promise<T>,
): Promise<T> {
  if (Array.isArray(tables))
    return database.transaction('rw', tables as readonly Table[], command)
  return database.transaction('rw', tables as Table, command)
}
