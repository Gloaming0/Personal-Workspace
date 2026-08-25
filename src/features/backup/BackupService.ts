import { currentDatabaseVersion } from '@/database/DailyWorkDatabase'
import type { Instant, UserId } from '@/domain/shared'
import { instantToLocalDate } from '@/domain/time'
import type { BackupRepository, SafetyBackupSink } from './contracts'
import { BackupError } from './errors'
import {
  backupFilename,
  backupFormat,
  currentBackupFormatVersion,
  summarizeBackupData,
  type BackupSummary,
  type DailyWorkBackup,
} from './format'
import { parseBackupDocument, validateBackupDocument } from './validation'

export interface BackupServiceContext {
  now?: () => Instant
  appVersion?: string | null
}

export interface PreparedBackup {
  backup: DailyWorkBackup
  filename: string
  json: string
  summary: BackupSummary
}

export class BackupService {
  private readonly now: () => Instant
  private readonly appVersion: string | null

  constructor(
    private readonly repository: BackupRepository,
    context: BackupServiceContext = {},
  ) {
    this.now = context.now ?? (() => new Date().toISOString())
    this.appVersion = context.appVersion ?? null
  }

  async createBackup(
    userId: UserId,
    timezone: string,
    safety = false,
  ): Promise<PreparedBackup> {
    const exportedAt = this.now()
    const data = await this.repository.readAll(userId)
    const backup = validateBackupDocument(
      {
        format: backupFormat,
        formatVersion: currentBackupFormatVersion,
        exportedAt,
        appVersion: this.appVersion,
        metadata: { sourceDatabaseVersion: currentDatabaseVersion, userId },
        data,
      },
      userId,
    )
    return {
      backup,
      filename: backupFilename(
        instantToLocalDate(exportedAt, timezone),
        safety,
      ),
      json: `${JSON.stringify(backup, null, 2)}\n`,
      summary: summarizeBackupData(backup.data),
    }
  }

  validateImport(json: string, userId: UserId): PreparedBackup {
    const backup = parseBackupDocument(json, userId)
    return {
      backup,
      filename: backupFilename(instantToLocalDate(backup.exportedAt, 'UTC')),
      json: `${JSON.stringify(backup, null, 2)}\n`,
      summary: summarizeBackupData(backup.data),
    }
  }

  async restore(
    userId: UserId,
    validatedBackup: DailyWorkBackup,
    timezone: string,
    safetySink: SafetyBackupSink,
  ): Promise<BackupSummary> {
    const backup = validateBackupDocument(validatedBackup, userId)
    const safety = await this.createBackup(userId, timezone, true)
    try {
      await safetySink.save(safety.backup, safety.filename)
    } catch (error) {
      throw new BackupError('safety-backup-failed', { cause: error })
    }
    await this.repository.replaceAll(userId, backup.data)
    return summarizeBackupData(backup.data)
  }
}
