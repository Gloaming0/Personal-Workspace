import Dexie, { type Table, type Transaction } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  DefaultUnitOfWorkTransaction,
  type UnitOfWork,
  type UnitOfWorkRepositories,
  type UnitOfWorkExecutionOptions,
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
import type { PersistedChange } from '@/repositories/dexie/changeNotification'
import {
  DeviceIdentityStore,
  type DeviceIdentityProvider,
} from '@/sync/DeviceIdentityStore'
import {
  createMutationMetadata,
  syncDeviceStateId,
  syncMetadataId,
  toLocalMutationRecord,
  toSyncMetadata,
} from '@/sync/journal'
import { MutationAlreadyAppliedError } from '@/sync/contracts'

export interface DexieUnitOfWorkOptions {
  deviceIdentity?: DeviceIdentityProvider
  createId?: () => string
  now?: () => string
}

export class DexieUnitOfWork implements UnitOfWork {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly repositoryOverrides?: (
      transaction: Transaction,
      stores: readonly UnitOfWorkStore[],
      collectChange: (change: PersistedChange) => void,
    ) => Partial<UnitOfWorkRepositories>,
    private readonly options: DexieUnitOfWorkOptions = {},
  ) {}

  execute<T>(
    stores: readonly UnitOfWorkStore[],
    command: (transaction: DefaultUnitOfWorkTransaction) => Promise<T>,
    options: UnitOfWorkExecutionOptions = {},
  ): Promise<T> {
    this.database.runtime.assertWritable()
    const uniqueStores = [...new Set(stores)]
    const committedChanges: PersistedChange[] = []
    const collectChange = (change: PersistedChange) =>
      committedChanges.push(change)
    const createId = this.options.createId ?? (() => crypto.randomUUID())
    const now = this.options.now ?? (() => new Date().toISOString())
    const deviceIdentity =
      this.options.deviceIdentity ?? new DeviceIdentityStore()
    let mutationMetadata: ReturnType<typeof createMutationMetadata> | undefined
    const resolveMutation = (userId: string) => {
      mutationMetadata ??= createMutationMetadata(
        userId,
        deviceIdentity,
        options.mutation,
        createId,
        now,
      )
      if (mutationMetadata.userId !== userId) {
        throw new Error('A mutation cannot change data for multiple users.')
      }
      return mutationMetadata
    }
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
        [
          ...uniqueStores.map((store) => tableByStore[store]),
          this.database.local_mutations,
          this.database.sync_metadata,
          this.database.sync_device_state,
          this.database.sync_bootstrap,
        ],
        async (transaction) => {
          const repositories: Partial<UnitOfWorkRepositories> = {}
          for (const store of uniqueStores) {
            if (store === 'tasks')
              repositories.tasks = new DexieTaskRepository(
                this.database,
                transaction.table('tasks') as typeof this.database.tasks,
                true,
                collectChange,
              )
            if (store === 'waiting')
              repositories.waiting = new DexieWaitingRepository(
                this.database,
                transaction.table(
                  'confirmations',
                ) as typeof this.database.confirmations,
                true,
                collectChange,
              )
            if (store === 'memos')
              repositories.memos = new DexieMemoRepository(
                this.database,
                transaction.table('memos') as typeof this.database.memos,
                true,
                collectChange,
              )
            if (store === 'routines')
              repositories.routines = new DexieRoutineRepository(
                this.database,
                transaction.table('routines') as typeof this.database.routines,
                true,
                collectChange,
              )
            if (store === 'routineLogs')
              repositories.routineLogs = new DexieRoutineLogRepository(
                this.database,
                transaction.table(
                  'routine_logs',
                ) as typeof this.database.routine_logs,
                true,
                collectChange,
              )
            if (store === 'dailyLogs')
              repositories.dailyLogs = new DexieDailyLogRepository(
                this.database,
                transaction.table(
                  'daily_logs',
                ) as typeof this.database.daily_logs,
                true,
                collectChange,
              )
            if (store === 'activities')
              repositories.activities = new DexieActivityRepository(
                this.database,
                transaction.table(
                  'activities',
                ) as typeof this.database.activities,
                collectChange,
              )
          }
          Object.assign(
            repositories,
            this.repositoryOverrides?.(
              transaction,
              uniqueStores,
              collectChange,
            ),
          )
          const result = await Dexie.waitFor(
            command(
              new DefaultUnitOfWorkTransaction(uniqueStores)
                .withRepositories(repositories)
                .withMutationResolver(resolveMutation),
            ),
          )
          const latest = [
            ...committedChanges
              .reduce((changes, change) => {
                const key = `${change.store}:${change.entityId}`
                const first = changes.get(key)
                changes.set(
                  key,
                  first
                    ? {
                        ...change,
                        baseVersion: first.baseVersion,
                        operation:
                          first.baseVersion === 0
                            ? 'create'
                            : change.entitySnapshot.deletedAt !== null
                              ? 'delete'
                              : 'update',
                      }
                    : change,
                )
                return changes
              }, new Map<string, PersistedChange>())
              .values(),
          ]
          if (latest.length === 0) return result

          const owners = new Set(latest.map((change) => change.userId))
          if (owners.size !== 1) {
            throw new Error('A mutation cannot change data for multiple users.')
          }
          const mutation = resolveMutation(latest[0]!.userId)
          const existing = await transaction
            .table('local_mutations')
            .get(mutation.mutationId)
          if (existing) {
            throw new MutationAlreadyAppliedError(mutation.mutationId)
          }

          const metadataTable = transaction.table('sync_metadata')
          const currentMetadata = new Map()
          for (const change of latest) {
            const metadataId = syncMetadataId(
              mutation.userId,
              change.entityType,
              change.entityId,
            )
            currentMetadata.set(metadataId, await metadataTable.get(metadataId))
          }
          const deviceStateId = syncDeviceStateId(
            mutation.userId,
            mutation.deviceId,
          )
          const currentDeviceState = await transaction
            .table('sync_device_state')
            .get(deviceStateId)
          const commitOrder = (currentDeviceState?.lastCommitOrder ?? 0) + 1
          await transaction
            .table('local_mutations')
            .add(
              toLocalMutationRecord(
                latest,
                mutation,
                commitOrder,
                currentMetadata,
              ),
            )
          for (const change of latest) {
            const metadataId = syncMetadataId(
              mutation.userId,
              change.entityType,
              change.entityId,
            )
            await metadataTable.put(
              toSyncMetadata(change, mutation, currentMetadata.get(metadataId)),
            )
          }
          await transaction.table('sync_device_state').put({
            id: deviceStateId,
            userId: mutation.userId,
            deviceId: mutation.deviceId,
            lastCommitOrder: commitOrder,
            lastPulledRevision: currentDeviceState?.lastPulledRevision ?? 0,
            updatedAt: mutation.occurredAt,
          })
          const bootstrap = await transaction
            .table('sync_bootstrap')
            .get(mutation.userId)
          if (!bootstrap || bootstrap.state === 'clean') {
            await transaction.table('sync_bootstrap').put({
              userId: mutation.userId,
              state: 'requires_bootstrap',
              updatedAt: mutation.occurredAt,
            })
          }
          return result
        },
      )
    return execute()
      .then((result) => {
        const latest = new Map(
          committedChanges.map((change) => [
            `${change.store}:${change.entityId}`,
            change,
          ]),
        )
        latest.forEach((change) => this.database.changes.publish(change))
        return result
      })
      .catch((error: unknown) => {
        if (classifyDatabaseError(error) !== 'unknown') {
          this.database.runtime.failure(error, {
            storeName: uniqueStores.join(','),
          })
        }
        throw error
      })
  }
}
