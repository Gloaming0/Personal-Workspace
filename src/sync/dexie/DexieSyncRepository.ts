import type { Table } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import type {
  Activity,
  DailyLog,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { SyncEntity } from '@/domain/shared'
import { isUtcInstant } from '@/domain/time'
import {
  assertRepositoryOwner,
  assertUserId,
  validateActivity,
  validateDailyLog,
  validateMemo,
  validateRoutine,
  validateRoutineLog,
  validateTask,
  validateWaiting,
} from '@/repositories/validation'
import { validateRemoteUniqueInvariants } from '../conflicts'
import type {
  LocalMutationChange,
  RemoteEntityChange,
  SyncEntityType,
  SyncMetadata,
  SyncRepository,
  TombstoneRecord,
} from '../contracts'
import { SyncConflictError } from '../contracts'
import { isUuid, syncMetadataId } from '../journal'
import {
  validateLocalMutationChange,
  validateSyncMetadata,
} from '../validation'
import { validatePersistedRows } from '@/repositories/dexie/validatePersistedRows'

type StoredEntity =
  Task | Waiting | Memo | Routine | RoutineLog | Activity | DailyLog

const validators: Record<SyncEntityType, (value: unknown) => StoredEntity> = {
  task: validateTask,
  waiting: validateWaiting,
  memo: validateMemo,
  routine: validateRoutine,
  routine_log: validateRoutineLog,
  activity: validateActivity,
  daily_log: validateDailyLog,
}

export class DexieSyncRepository implements SyncRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async listPendingChanges(userId: string): Promise<LocalMutationChange[]> {
    assertUserId(userId)
    return structuredClone(
      validatePersistedRows(
        this.database,
        'local_changes',
        await this.database.local_changes
          .where('[userId+status]')
          .equals([userId, 'pending'])
          .sortBy('occurredAt'),
        validateLocalMutationChange,
      ),
    )
  }

  async listTombstones(
    userId: string,
    entityType?: SyncEntityType,
  ): Promise<TombstoneRecord[]> {
    assertUserId(userId)
    const types = entityType
      ? [entityType]
      : (Object.keys(validators) as SyncEntityType[])
    const results: TombstoneRecord[] = []
    for (const type of types) {
      const rows = await this.table(type)
        .filter((row) => row.userId === userId && row.deletedAt !== null)
        .toArray()
      validatePersistedRows(
        this.database,
        this.table(type).name,
        rows,
        validators[type],
      ).forEach((validated) => {
        results.push({ entityType: type, entity: structuredClone(validated) })
      })
    }
    return results.sort((left, right) =>
      (left.entity.deletedAt ?? '').localeCompare(right.entity.deletedAt ?? ''),
    )
  }

  async getEntityIncludingDeleted(
    userId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncEntity | null> {
    assertUserId(userId)
    const row = await this.table(entityType).get(entityId)
    if (!row || row.userId !== userId) return null
    return structuredClone(validators[entityType](row))
  }

  async getSyncMetadata(
    userId: string,
    entityType: SyncEntityType,
    entityId: string,
  ): Promise<SyncMetadata | null> {
    assertUserId(userId)
    const metadata = await this.database.sync_metadata.get(
      syncMetadataId(userId, entityType, entityId),
    )
    return metadata?.userId === userId
      ? structuredClone(validateSyncMetadata(metadata))
      : null
  }

  async applyRemoteChange(change: RemoteEntityChange): Promise<void> {
    this.database.runtime.assertWritable()
    assertUserId(change.userId)
    if (
      !isUuid(change.mutationId) ||
      !isUuid(change.deviceId) ||
      !isUtcInstant(change.occurredAt) ||
      !Number.isInteger(change.serverRevision) ||
      change.serverRevision < 1
    ) {
      throw new Error('Invalid remote change metadata.')
    }
    const entity = validators[change.entityType](change.entity)
    assertRepositoryOwner(change.userId, entity)
    const table = this.table(change.entityType)
    await this.database.transaction(
      'rw',
      [table, this.database.sync_metadata, this.database.local_changes],
      async () => {
        const rawCurrent = await table.get(entity.id)
        if (rawCurrent && rawCurrent.userId !== change.userId) {
          throw new SyncConflictError({
            type: 'OwnershipConflict',
            entityType: change.entityType,
            entityId: entity.id,
          })
        }
        const metadataId = syncMetadataId(
          change.userId,
          change.entityType,
          entity.id,
        )
        const currentMetadata =
          await this.database.sync_metadata.get(metadataId)
        const pending = await this.database.local_changes
          .where('[entityType+entityId]')
          .equals([change.entityType, entity.id])
          .and(
            (entry) =>
              entry.userId === change.userId &&
              entry.status === 'pending' &&
              entry.mutationId !== change.mutationId &&
              entry.baseServerRevision === change.baseServerRevision,
          )
          .first()
        if (pending) {
          throw new SyncConflictError({
            type:
              pending.operation === 'delete' || entity.deletedAt !== null
                ? 'DeleteVsUpdate'
                : 'SameBaseConcurrentEdit',
            entityType: change.entityType,
            entityId: entity.id,
          })
        }
        if (
          currentMetadata &&
          currentMetadata.serverRevision !== change.baseServerRevision
        ) {
          throw new SyncConflictError({
            type:
              rawCurrent?.deletedAt !== null && entity.deletedAt === null
                ? 'DeleteVsUpdate'
                : 'SameBaseConcurrentEdit',
            entityType: change.entityType,
            entityId: entity.id,
          })
        }
        if (
          change.entityType === 'daily_log' &&
          rawCurrent &&
          rawCurrent.deletedAt === null &&
          JSON.stringify(rawCurrent) !== JSON.stringify(entity)
        ) {
          throw new SyncConflictError({
            type: 'ImmutableDailyLogConflict',
            entityId: entity.id,
            date: (entity as DailyLog).date,
          })
        }
        const peers = await table
          .filter((row) => row.userId === change.userId)
          .toArray()
        const invariantConflict = validateRemoteUniqueInvariants(
          change.entityType,
          entity,
          peers,
        )
        if (invariantConflict) throw new SyncConflictError(invariantConflict)

        await table.put(structuredClone(entity))
        await this.database.sync_metadata.put({
          id: metadataId,
          userId: change.userId,
          entityType: change.entityType,
          entityId: entity.id,
          localVersion: entity.version,
          baseServerRevision: change.serverRevision,
          serverRevision: change.serverRevision,
          lastMutationId: change.mutationId,
          lastModifiedByDeviceId: change.deviceId,
          updatedAt: change.occurredAt,
        })
      },
    )
    const stores = {
      task: 'tasks',
      waiting: 'confirmations',
      memo: 'memos',
      routine: 'routines',
      routine_log: 'routine_logs',
      activity: 'activities',
      daily_log: 'daily_logs',
    } as const
    this.database.changes.publish({
      store: stores[change.entityType],
      entityId: entity.id,
      entityVersion: entity.version,
    })
  }

  async markMutationAcknowledged(
    userId: string,
    mutationId: string,
    serverRevision: number,
    acknowledgedAt: string,
  ): Promise<void> {
    assertUserId(userId)
    if (
      !isUuid(mutationId) ||
      !Number.isInteger(serverRevision) ||
      serverRevision < 1 ||
      !isUtcInstant(acknowledgedAt)
    ) {
      throw new Error('Invalid mutation acknowledgement.')
    }
    await this.database.transaction(
      'rw',
      [this.database.local_changes, this.database.sync_metadata],
      async () => {
        const changes = await this.database.local_changes
          .where('[userId+mutationId]')
          .equals([userId, mutationId])
          .toArray()
        for (const change of changes) {
          await this.database.local_changes.update(change.id, {
            status: 'acknowledged',
            acknowledgedAt,
          })
          const id = syncMetadataId(userId, change.entityType, change.entityId)
          const metadata = await this.database.sync_metadata.get(id)
          if (metadata?.lastMutationId === mutationId) {
            await this.database.sync_metadata.update(id, {
              baseServerRevision: serverRevision,
              serverRevision,
              updatedAt: acknowledgedAt,
            })
          }
        }
      },
    )
  }

  private table(entityType: SyncEntityType): Table<StoredEntity, string> {
    const tables: Record<SyncEntityType, Table<StoredEntity, string>> = {
      task: this.database.tasks as Table<StoredEntity, string>,
      waiting: this.database.confirmations as Table<StoredEntity, string>,
      memo: this.database.memos as Table<StoredEntity, string>,
      routine: this.database.routines as Table<StoredEntity, string>,
      routine_log: this.database.routine_logs as Table<StoredEntity, string>,
      activity: this.database.activities as Table<StoredEntity, string>,
      daily_log: this.database.daily_logs as Table<StoredEntity, string>,
    }
    return tables[entityType]
  }
}
