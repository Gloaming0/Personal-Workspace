import {
  DailyWorkDatabase,
  initializeLocalDatabase,
} from '@/database/DailyWorkDatabase'
import { BackupService } from './BackupService'
import { DexieBackupRepository } from './DexieBackupRepository'

export interface BackupRuntime {
  service: BackupService
  ready: Promise<void>
}

export function createBackupRuntime(
  database = new DailyWorkDatabase(),
): BackupRuntime {
  return {
    service: new BackupService(new DexieBackupRepository(database)),
    ready: initializeLocalDatabase(database),
  }
}

let runtime: BackupRuntime | undefined

export function getBackupRuntime(): BackupRuntime {
  runtime ??= createBackupRuntime()
  return runtime
}
