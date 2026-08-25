import Dexie, { type Table, type Transaction } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  DefaultUnitOfWorkTransaction,
  type UnitOfWork,
  type UnitOfWorkRepositories,
  type UnitOfWorkStore,
} from '../contracts'
import { DexieTaskRepository } from '@/repositories/dexie/DexieTaskRepository'
import { DexieWaitingRepository } from '@/repositories/dexie/DexieWaitingRepository'
import { DexieMemoRepository } from '@/repositories/dexie/DexieMemoRepository'
import { DexieRoutineRepository } from '@/repositories/dexie/DexieRoutineRepository'
import { DexieRoutineLogRepository } from '@/repositories/dexie/DexieRoutineLogRepository'
import { DexieDailyLogRepository } from '@/repositories/dexie/DexieDailyLogRepository'
import { DexieActivityRepository } from '@/repositories/dexie/DexieActivityRepository'
import { classifyDatabaseError } from '@/database/runtimeState'

export class DexieUnitOfWork implements UnitOfWork {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly repositoryOverrides?: (
      transaction: Transaction,
      stores: readonly UnitOfWorkStore[],
    ) => Partial<UnitOfWorkRepositories>,
  ) {}

  execute<T>(
    stores: readonly UnitOfWorkStore[],
    command: (transaction: DefaultUnitOfWorkTransaction) => Promise<T>,
  ): Promise<T> {
    this.database.runtime.assertWritable()
    const uniqueStores = [...new Set(stores)]
    const tableByStore: Record<UnitOfWorkStore, Table> = {
      tasks: this.database.tasks,
      waiting: this.database.confirmations,
      memos: this.database.memos,
      routines: this.database.routines,
      routineLogs: this.database.routine_logs,
      dailyLogs: this.database.daily_logs,
      activities: this.database.activities,
    }
    const execute = () =>
      this.database.transaction(
        'rw',
        uniqueStores.map((store) => tableByStore[store]),
        (transaction) => {
          const repositories: Partial<UnitOfWorkRepositories> = {}
          for (const store of uniqueStores) {
            if (store === 'tasks')
              repositories.tasks = new DexieTaskRepository(
                this.database,
                transaction.table('tasks') as typeof this.database.tasks,
                true,
              )
            if (store === 'waiting')
              repositories.waiting = new DexieWaitingRepository(
                this.database,
                transaction.table(
                  'confirmations',
                ) as typeof this.database.confirmations,
                true,
              )
            if (store === 'memos')
              repositories.memos = new DexieMemoRepository(
                this.database,
                transaction.table('memos') as typeof this.database.memos,
                true,
              )
            if (store === 'routines')
              repositories.routines = new DexieRoutineRepository(
                this.database,
                transaction.table('routines') as typeof this.database.routines,
                true,
              )
            if (store === 'routineLogs')
              repositories.routineLogs = new DexieRoutineLogRepository(
                this.database,
                transaction.table(
                  'routine_logs',
                ) as typeof this.database.routine_logs,
                true,
              )
            if (store === 'dailyLogs')
              repositories.dailyLogs = new DexieDailyLogRepository(
                this.database,
                transaction.table(
                  'daily_logs',
                ) as typeof this.database.daily_logs,
                true,
              )
            if (store === 'activities')
              repositories.activities = new DexieActivityRepository(
                this.database,
                transaction.table(
                  'activities',
                ) as typeof this.database.activities,
              )
          }
          Object.assign(
            repositories,
            this.repositoryOverrides?.(transaction, uniqueStores),
          )
          return Dexie.waitFor(
            command(
              new DefaultUnitOfWorkTransaction(uniqueStores).withRepositories(
                repositories,
              ),
            ),
          )
        },
      )
    return execute().catch((error: unknown) => {
      if (classifyDatabaseError(error) !== 'unknown') {
        this.database.runtime.failure(error, {
          storeName: uniqueStores.join(','),
        })
      }
      throw error
    })
  }
}
