import type { InsertType, Table } from 'dexie'
import type { UserId } from '@/domain/shared'
import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import { classifyDatabaseError } from '@/database/runtimeState'
import type { BackupRepository } from './contracts'
import type { BackupData } from './format'
import { BackupError } from './errors'
import { validateBackupData } from './validation'

type BackupStoreName =
  | 'tasks'
  | 'confirmations'
  | 'memos'
  | 'routines'
  | 'routine_logs'
  | 'activities'
  | 'daily_logs'

export interface DexieBackupRepositoryOptions {
  failAfterStore?: BackupStoreName
}

const notificationStores = [
  'tasks',
  'confirmations',
  'memos',
  'routines',
  'routine_logs',
  'activities',
  'daily_logs',
] as const

export class DexieBackupRepository implements BackupRepository {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly options: DexieBackupRepositoryOptions = {},
  ) {}

  async readAll(userId: UserId): Promise<BackupData> {
    try {
      await this.database.open()
      const [
        tasks,
        waiting,
        memos,
        routines,
        routineLogs,
        activities,
        dailyLogs,
      ] = await Promise.all([
        this.ownedRows<Task>(this.database.tasks, userId),
        this.ownedRows<Waiting>(this.database.confirmations, userId),
        this.ownedRows<Memo>(this.database.memos, userId),
        this.ownedRows<Routine>(this.database.routines, userId),
        this.ownedRows<RoutineLog>(this.database.routine_logs, userId),
        this.ownedRows<Activity>(this.database.activities, userId),
        this.ownedRows<DailyLog>(this.database.daily_logs, userId),
      ])
      return validateBackupData(
        { tasks, waiting, memos, routines, routineLogs, activities, dailyLogs },
        userId,
      )
    } catch (error) {
      if (error instanceof BackupError) throw error
      throw new BackupError('export-failed', { cause: error })
    }
  }

  async replaceAll(userId: UserId, data: BackupData): Promise<void> {
    this.database.runtime.assertWritable()
    const validated = validateBackupData(data, userId)
    const tables = [
      this.database.tasks,
      this.database.confirmations,
      this.database.memos,
      this.database.routines,
      this.database.routine_logs,
      this.database.activities,
      this.database.daily_logs,
      this.database.local_changes,
      this.database.local_mutations,
      this.database.sync_metadata,
      this.database.sync_device_state,
      this.database.sync_conflicts,
      this.database.sync_bootstrap,
      this.database.bootstrap_progress,
      this.database.ownership_checkpoints,
    ]
    try {
      await this.database.transaction('rw', tables, async () => {
        await this.replaceStore(
          'tasks',
          this.database.tasks,
          userId,
          validated.tasks,
        )
        await this.replaceStore(
          'confirmations',
          this.database.confirmations,
          userId,
          validated.waiting,
        )
        await this.replaceStore(
          'memos',
          this.database.memos,
          userId,
          validated.memos,
        )
        await this.replaceStore(
          'routines',
          this.database.routines,
          userId,
          validated.routines,
        )
        await this.replaceStore(
          'routine_logs',
          this.database.routine_logs,
          userId,
          validated.routineLogs,
        )
        await this.replaceStore(
          'activities',
          this.database.activities,
          userId,
          validated.activities,
        )
        await this.replaceStore(
          'daily_logs',
          this.database.daily_logs,
          userId,
          validated.dailyLogs,
        )
        await this.database.local_changes
          .filter((change) => change.userId === userId)
          .delete()
        await this.database.local_mutations
          .filter((mutation) => mutation.userId === userId)
          .delete()
        await this.database.sync_metadata
          .filter((metadata) => metadata.userId === userId)
          .delete()
        await this.database.sync_conflicts
          .filter((conflict) => conflict.userId === userId)
          .delete()
        const progress = await this.database.bootstrap_progress.get(userId)
        await this.database.bootstrap_progress.delete(userId)
        if (progress) {
          await this.database.ownership_checkpoints.delete(progress.bootstrapId)
        }
        const restoredAt = new Date().toISOString()
        await this.database.sync_device_state
          .filter((state) => state.userId === userId)
          .modify((state) => {
            state.lastPulledRevision = 0
            state.updatedAt = restoredAt
          })
        await this.database.sync_bootstrap.put({
          userId,
          state: 'requires_bootstrap',
          updatedAt: restoredAt,
        })

        const restored = await this.readAllInsideTransaction(userId)
        validateBackupData(restored, userId)
      })
    } catch (error) {
      const category = classifyDatabaseError(error)
      if (category !== 'unknown') {
        this.database.runtime.failure(error, { storeName: 'backup-restore' })
      }
      throw new BackupError('restore-failed', { cause: error })
    }

    notificationStores.forEach((store) =>
      this.database.changes.publish({
        store,
        entityId: 'backup-restore',
        entityVersion: 1,
      }),
    )
  }

  private async readAllInsideTransaction(userId: UserId): Promise<BackupData> {
    const [
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      dailyLogs,
    ] = await Promise.all([
      this.ownedRows<Task>(this.database.tasks, userId),
      this.ownedRows<Waiting>(this.database.confirmations, userId),
      this.ownedRows<Memo>(this.database.memos, userId),
      this.ownedRows<Routine>(this.database.routines, userId),
      this.ownedRows<RoutineLog>(this.database.routine_logs, userId),
      this.ownedRows<Activity>(this.database.activities, userId),
      this.ownedRows<DailyLog>(this.database.daily_logs, userId),
    ])
    return {
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      dailyLogs,
    }
  }

  private ownedRows<T extends { id: string; userId: UserId }>(
    table: Table<T, string, InsertType<T, 'id'>>,
    userId: UserId,
  ): Promise<T[]> {
    return table
      .filter((row) => row.userId === userId)
      .toArray()
      .then((rows) => structuredClone(rows))
  }

  private async replaceStore<T extends { id: string; userId: UserId }>(
    storeName: BackupStoreName,
    table: Table<T, string, InsertType<T, 'id'>>,
    userId: UserId,
    rows: readonly T[],
  ): Promise<void> {
    await table.filter((row) => row.userId === userId).delete()
    if (rows.length > 0) await table.bulkAdd(structuredClone(rows))
    if (this.options.failAfterStore === storeName) {
      throw new Error(`Injected restore failure after ${storeName}.`)
    }
  }
}
