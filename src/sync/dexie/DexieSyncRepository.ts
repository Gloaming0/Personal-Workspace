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
import { validatePersistedRows } from '@/repositories/dexie/validatePersistedRows'
import { validateRemoteUniqueInvariants } from '../conflicts'
import type {
  ApplyRemotePageResult,
  LocalMutationRecord,
  MutationAck,
  PersistedSyncConflict,
  RemoteChangePage,
  RemoteEntityChange,
  SyncConflict,
  SyncBootstrapState,
  SyncEntityType,
  SyncMetadata,
  SyncRepository,
  TombstoneRecord,
} from '../contracts'
import { SyncConflictError } from '../contracts'
import {
  isUuid,
  mutationEntityKey,
  syncDeviceStateId,
  syncMetadataId,
} from '../journal'
import {
  validateLocalMutationRecord,
  validateSyncMetadata,
} from '../validation'

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

const stores = {
  task: 'tasks',
  waiting: 'confirmations',
  memo: 'memos',
  routine: 'routines',
  routine_log: 'routine_logs',
  activity: 'activities',
  daily_log: 'daily_logs',
} as const

export class DexieSyncRepository implements SyncRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async listPendingMutations(
    userId: string,
    deviceId?: string,
  ): Promise<LocalMutationRecord[]> {
    assertUserId(userId)
    if (deviceId !== undefined && !isUuid(deviceId)) {
      throw new Error('Invalid device identifier.')
    }
    const records = validatePersistedRows(
      this.database,
      'local_mutations',
      await this.database.local_mutations
        .filter(
          (record) =>
            record.userId === userId &&
            (!deviceId || record.deviceId === deviceId),
        )
        .toArray(),
      validateLocalMutationRecord,
    )
    const byId = new Map(records.map((record) => [record.mutationId, record]))
    return structuredClone(
      records
        .filter(
          (record) =>
            record.status === 'pending' &&
            record.changes.every((change) => {
              if (!change.predecessorMutationId) return true
              return (
                byId.get(change.predecessorMutationId)?.status ===
                'acknowledged'
              )
            }),
        )
        .sort((left, right) => left.commitOrder - right.commitOrder),
    )
  }

  async markMutationInFlight(
    userId: string,
    mutationId: string,
  ): Promise<void> {
    const mutation = await this.ownedMutation(userId, mutationId)
    if (mutation.status === 'in_flight') return
    if (mutation.status !== 'pending') {
      throw new Error('Only a pending mutation can enter in-flight state.')
    }
    await this.database.local_mutations.update(mutationId, {
      status: 'in_flight',
    })
  }

  async recoverInFlight(userId: string, deviceId: string): Promise<number> {
    assertUserId(userId)
    if (!isUuid(deviceId)) throw new Error('Invalid device identifier.')
    return this.database.local_mutations
      .filter(
        (mutation) =>
          mutation.userId === userId &&
          mutation.deviceId === deviceId &&
          mutation.status === 'in_flight',
      )
      .modify({ status: 'pending' })
  }

  async markMutationFailedPermanent(
    userId: string,
    mutationId: string,
    failureCode: string,
  ): Promise<void> {
    if (!failureCode.trim()) throw new Error('A failure code is required.')
    const mutation = await this.ownedMutation(userId, mutationId)
    if (mutation.status === 'acknowledged') {
      throw new Error('An acknowledged mutation cannot fail permanently.')
    }
    await this.database.local_mutations.update(mutationId, {
      status: 'failed_permanent',
      failureCode,
    })
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

  async markMutationAcknowledged(
    userId: string,
    acknowledgement: MutationAck,
    acknowledgedAt: string,
  ): Promise<void> {
    assertUserId(userId)
    if (!isUuid(acknowledgement.mutationId) || !isUtcInstant(acknowledgedAt)) {
      throw new Error('Invalid mutation acknowledgement.')
    }
    await this.database.transaction(
      'rw',
      [this.database.local_mutations, this.database.sync_metadata],
      async () => {
        const mutation = await this.ownedMutation(
          userId,
          acknowledgement.mutationId,
        )
        const results = [...acknowledgement.entityResults].sort((left, right) =>
          mutationEntityKey(left.entityType, left.entityId).localeCompare(
            mutationEntityKey(right.entityType, right.entityId),
          ),
        )
        const expectedKeys = mutation.changes
          .map((change) =>
            mutationEntityKey(change.entityType, change.entityId),
          )
          .sort()
        if (
          results.length !== expectedKeys.length ||
          results.some(
            (result, index) =>
              mutationEntityKey(result.entityType, result.entityId) !==
                expectedKeys[index] ||
              !Number.isInteger(result.serverRevision) ||
              result.serverRevision < 1 ||
              !Number.isInteger(result.serverVersion) ||
              result.serverVersion < 1,
          )
        ) {
          throw new Error('Acknowledgement results do not match the mutation.')
        }
        if (mutation.status === 'acknowledged') {
          if (
            JSON.stringify(mutation.entityResults) !== JSON.stringify(results)
          )
            throw new Error('Acknowledgement replay has different results.')
          return
        }
        if (
          mutation.status === 'conflicted' ||
          mutation.status === 'failed_permanent'
        ) {
          throw new Error('A terminal mutation cannot be acknowledged.')
        }
        await this.database.local_mutations.update(mutation.mutationId, {
          status: 'acknowledged',
          acknowledgedAt,
          entityResults: results,
          failureCode: null,
        })
        for (const result of results) {
          const id = syncMetadataId(userId, result.entityType, result.entityId)
          const metadata = await this.database.sync_metadata.get(id)
          if (!metadata) continue
          if (
            metadata.serverRevision !== null &&
            metadata.serverRevision > result.serverRevision
          )
            continue
          await this.database.sync_metadata.update(id, {
            baseServerRevision: result.serverRevision,
            serverRevision: result.serverRevision,
            serverVersion: result.serverVersion,
            lastAcknowledgedMutationId: mutation.mutationId,
          })
          const predecessor = mutation.changes.find(
            (change) =>
              change.entityType === result.entityType &&
              change.entityId === result.entityId,
          )!
          const successors = await this.database.local_mutations
            .where('entityKeys')
            .equals(mutationEntityKey(result.entityType, result.entityId))
            .and(
              (candidate) =>
                candidate.userId === userId &&
                candidate.status === 'pending' &&
                candidate.changes.some(
                  (change) =>
                    change.entityType === result.entityType &&
                    change.entityId === result.entityId &&
                    change.predecessorMutationId === mutation.mutationId &&
                    change.baseLocalVersion ===
                      predecessor.resultingLocalVersion,
                ),
            )
            .toArray()
          for (const successor of successors) {
            await this.database.local_mutations.update(successor.mutationId, {
              changes: successor.changes.map((change) =>
                change.entityType === result.entityType &&
                change.entityId === result.entityId &&
                change.predecessorMutationId === mutation.mutationId &&
                change.baseLocalVersion === predecessor.resultingLocalVersion
                  ? { ...change, baseServerRevision: result.serverRevision }
                  : change,
              ),
            })
          }
        }
      },
    )
  }

  async applyRemotePage(
    page: RemoteChangePage,
  ): Promise<ApplyRemotePageResult> {
    this.database.runtime.assertWritable()
    assertUserId(page.userId)
    if (
      !isUuid(page.deviceId) ||
      !Number.isInteger(page.fromRevision) ||
      page.fromRevision < 0 ||
      !Number.isInteger(page.toRevision) ||
      page.toRevision < page.fromRevision
    ) {
      throw new Error('Invalid remote page metadata.')
    }
    const deviceStateId = syncDeviceStateId(page.userId, page.deviceId)
    const published: Array<{
      entityType: SyncEntityType
      entity: StoredEntity
    }> = []
    const result = await this.database.transaction(
      'rw',
      [
        this.database.tasks,
        this.database.confirmations,
        this.database.memos,
        this.database.routines,
        this.database.routine_logs,
        this.database.activities,
        this.database.daily_logs,
        this.database.local_mutations,
        this.database.sync_metadata,
        this.database.sync_device_state,
        this.database.sync_conflicts,
      ],
      async (): Promise<ApplyRemotePageResult> => {
        const state = await this.database.sync_device_state.get(deviceStateId)
        const cursor = state?.lastPulledRevision ?? 0
        if (page.toRevision <= cursor) {
          return { applied: 0, conflicts: [], cursor }
        }
        if (page.fromRevision !== cursor) {
          throw new Error('Remote page does not start at the durable cursor.')
        }
        let previousRevision = page.fromRevision
        for (const change of page.changes) {
          this.validateRemoteChange(change, page.userId)
          if (
            change.serverRevision <= previousRevision ||
            change.serverRevision > page.toRevision
          ) {
            throw new Error('Remote page revisions are not strictly ordered.')
          }
          previousRevision = change.serverRevision
        }

        const conflicts: PersistedSyncConflict[] = []
        let applied = 0
        for (const change of page.changes) {
          const entity = validators[change.entityType](change.entity)
          const metadataId = syncMetadataId(
            page.userId,
            change.entityType,
            entity.id,
          )
          const metadata = await this.database.sync_metadata.get(metadataId)
          if (
            metadata?.serverRevision !== null &&
            metadata?.serverRevision !== undefined &&
            metadata.serverRevision >= change.serverRevision
          )
            continue

          const key = mutationEntityKey(change.entityType, entity.id)
          const intersecting = await this.database.local_mutations
            .where('entityKeys')
            .equals(key)
            .and(
              (mutation) =>
                mutation.userId === page.userId &&
                (mutation.status === 'pending' ||
                  mutation.status === 'in_flight' ||
                  mutation.status === 'conflicted'),
            )
            .first()
          if (intersecting) {
            const local = intersecting.changes.find(
              (candidate) =>
                candidate.entityType === change.entityType &&
                candidate.entityId === entity.id,
            )!
            const conflict = this.intersectionConflict(local.operation, change)
            const persisted = this.persistedConflict(
              page.userId,
              intersecting.mutationId,
              change,
              conflict,
            )
            await this.database.sync_conflicts.put(persisted)
            await this.database.local_mutations.update(
              intersecting.mutationId,
              { status: 'conflicted' },
            )
            conflicts.push(persisted)
            continue
          }

          const table = this.table(change.entityType)
          const rawCurrent = await table.get(entity.id)
          if (rawCurrent && rawCurrent.userId !== page.userId) {
            throw new SyncConflictError({
              type: 'OwnershipConflict',
              entityType: change.entityType,
              entityId: entity.id,
            })
          }
          let conflict: SyncConflict | null
          if (
            change.entityType === 'daily_log' &&
            rawCurrent &&
            rawCurrent.deletedAt === null &&
            JSON.stringify(rawCurrent) !== JSON.stringify(entity)
          ) {
            conflict = {
              type: 'ImmutableDailyLogConflict',
              entityId: entity.id,
              date: (entity as DailyLog).date,
            }
          } else {
            const peers = await table
              .filter((row) => row.userId === page.userId)
              .toArray()
            conflict = validateRemoteUniqueInvariants(
              change.entityType,
              entity,
              peers,
            )
          }
          if (conflict) {
            const persisted = this.persistedConflict(
              page.userId,
              null,
              change,
              conflict,
            )
            await this.database.sync_conflicts.put(persisted)
            conflicts.push(persisted)
            continue
          }

          await table.put(structuredClone(entity))
          await this.database.sync_metadata.put({
            id: metadataId,
            userId: page.userId,
            entityType: change.entityType,
            entityId: entity.id,
            localVersion: entity.version,
            baseServerRevision: change.serverRevision,
            serverRevision: change.serverRevision,
            serverVersion: change.serverVersion,
            lastMutationId: change.mutationId,
            lastAcknowledgedMutationId: change.mutationId,
            lastModifiedByDeviceId: change.deviceId,
            updatedAt: change.occurredAt,
          })
          published.push({ entityType: change.entityType, entity })
          applied += 1
        }
        await this.database.sync_device_state.put({
          id: deviceStateId,
          userId: page.userId,
          deviceId: page.deviceId,
          lastCommitOrder: state?.lastCommitOrder ?? 0,
          lastPulledRevision: page.toRevision,
          updatedAt:
            page.changes.at(-1)?.occurredAt ?? new Date().toISOString(),
        })
        return {
          applied,
          conflicts: structuredClone(conflicts),
          cursor: page.toRevision,
        }
      },
    )
    published.forEach(({ entityType, entity }) =>
      this.database.changes.publish({
        store: stores[entityType],
        entityId: entity.id,
        entityVersion: entity.version,
      }),
    )
    return result
  }

  async getPullCursor(userId: string, deviceId: string): Promise<number> {
    assertUserId(userId)
    if (!isUuid(deviceId)) throw new Error('Invalid device identifier.')
    return (
      (
        await this.database.sync_device_state.get(
          syncDeviceStateId(userId, deviceId),
        )
      )?.lastPulledRevision ?? 0
    )
  }

  async getBootstrapState(userId: string) {
    assertUserId(userId)
    return (await this.database.sync_bootstrap.get(userId))?.state ?? 'clean'
  }

  async setBootstrapState(
    userId: string,
    state: SyncBootstrapState,
    updatedAt: string,
  ): Promise<void> {
    assertUserId(userId)
    if (
      !['clean', 'requires_bootstrap', 'bootstrapped'].includes(state) ||
      !isUtcInstant(updatedAt)
    )
      throw new Error('Invalid bootstrap state.')
    await this.database.sync_bootstrap.put({ userId, state, updatedAt })
  }

  async listConflicts(userId: string): Promise<PersistedSyncConflict[]> {
    assertUserId(userId)
    return structuredClone(
      await this.database.sync_conflicts
        .where('[userId+status]')
        .equals([userId, 'open'])
        .sortBy('createdAt'),
    )
  }

  private async ownedMutation(userId: string, mutationId: string) {
    assertUserId(userId)
    if (!isUuid(mutationId)) throw new Error('Invalid mutation identifier.')
    const mutation = await this.database.local_mutations.get(mutationId)
    if (!mutation || mutation.userId !== userId) {
      throw new Error('Mutation was not found for this user.')
    }
    return validateLocalMutationRecord(mutation)
  }

  private validateRemoteChange(change: RemoteEntityChange, userId: string) {
    if (
      change.userId !== userId ||
      !isUuid(change.mutationId) ||
      !isUuid(change.deviceId) ||
      !isUtcInstant(change.occurredAt) ||
      !Number.isInteger(change.serverRevision) ||
      change.serverRevision < 1 ||
      !Number.isInteger(change.serverVersion) ||
      change.serverVersion < 1 ||
      !['create', 'update', 'delete'].includes(change.operation)
    ) {
      throw new Error('Invalid remote change metadata.')
    }
    const entity = validators[change.entityType](change.entity)
    assertRepositoryOwner(userId, entity)
    if (change.operation === 'delete' && entity.deletedAt === null) {
      throw new Error('A remote delete must contain a complete tombstone.')
    }
  }

  private intersectionConflict(
    localOperation: 'create' | 'update' | 'delete',
    remote: RemoteEntityChange,
  ): SyncConflict {
    if (remote.entityType === 'daily_log') {
      return {
        type: 'ImmutableDailyLogConflict',
        entityId: remote.entity.id,
        date: (remote.entity as DailyLog).date,
      }
    }
    if (localOperation === 'delete' || remote.operation === 'delete') {
      return {
        type: 'DeleteVsUpdate',
        entityType: remote.entityType,
        entityId: remote.entity.id,
      }
    }
    return {
      type: 'SameBaseConcurrentEdit',
      entityType: remote.entityType,
      entityId: remote.entity.id,
    }
  }

  private persistedConflict(
    userId: string,
    mutationId: string | null,
    remoteChange: RemoteEntityChange,
    conflict: SyncConflict,
  ): PersistedSyncConflict {
    return {
      id: `${userId}:${remoteChange.serverRevision}:${remoteChange.entityType}:${remoteChange.entity.id}`,
      userId,
      mutationId,
      entityType: remoteChange.entityType,
      entityId: remoteChange.entity.id,
      conflict,
      remoteChange: structuredClone(remoteChange),
      status: 'open',
      createdAt: remoteChange.occurredAt,
      resolvedAt: null,
    }
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
