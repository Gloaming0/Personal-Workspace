import type { UserId } from '@/domain/shared'
import type { BackupData, DailyWorkBackup } from './format'

export interface BackupRepository {
  readAll(userId: UserId): Promise<BackupData>
  replaceAll(userId: UserId, data: BackupData): Promise<void>
}

export interface SafetyBackupSink {
  save(backup: DailyWorkBackup, filename: string): Promise<void>
}
