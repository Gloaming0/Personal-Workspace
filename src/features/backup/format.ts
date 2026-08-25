import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { Instant, UserId } from '@/domain/shared'

export const backupFormat = 'daily-work-os-backup' as const
export const currentBackupFormatVersion = 1 as const

export interface BackupData {
  tasks: Task[]
  waiting: Waiting[]
  memos: Memo[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  activities: Activity[]
  dailyLogs: DailyLog[]
}

export interface DailyWorkBackupV1 {
  format: typeof backupFormat
  formatVersion: typeof currentBackupFormatVersion
  exportedAt: Instant
  appVersion: string | null
  metadata: {
    sourceDatabaseVersion: number
    userId: UserId
  }
  data: BackupData
}

export type DailyWorkBackup = DailyWorkBackupV1

export interface BackupSummary {
  tasks: number
  waiting: number
  memos: number
  routines: number
  routineLogs: number
  activities: number
  dailyLogs: number
  tombstones: number
  total: number
}

export function summarizeBackupData(data: BackupData): BackupSummary {
  const collections = [
    data.tasks,
    data.waiting,
    data.memos,
    data.routines,
    data.routineLogs,
    data.activities,
    data.dailyLogs,
  ]
  return {
    tasks: data.tasks.length,
    waiting: data.waiting.length,
    memos: data.memos.length,
    routines: data.routines.length,
    routineLogs: data.routineLogs.length,
    activities: data.activities.length,
    dailyLogs: data.dailyLogs.length,
    tombstones: collections.reduce(
      (count, rows) =>
        count + rows.filter((entity) => entity.deletedAt !== null).length,
      0,
    ),
    total: collections.reduce((count, rows) => count + rows.length, 0),
  }
}

export function backupFilename(date: string, safety = false): string {
  return `daily-work-os-${safety ? 'safety-' : ''}backup-${date}.json`
}
