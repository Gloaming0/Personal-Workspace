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
import { validateBackupData } from '@/features/backup/validation'
import type { BackupData } from '@/features/backup/format'
import type {
  BootstrapProgressRecord,
  MutationEntityResult,
  SyncEntityType,
} from '@/sync/contracts'
import { syncDeviceStateId, syncMetadataId } from '@/sync/journal'
import type { BootstrapLocalPort } from './contracts'
import {
  bootstrapFormat,
  bootstrapFormatVersion,
  type BootstrapSnapshot,
  type CloudBootstrapSnapshot,
} from './model'
import { validateCloudBootstrapSnapshot } from './validation'

interface OwnedTable<T> {
  filter(predicate: (row: T) => boolean): { toArray(): Promise<T[]> }
}

const stores: Record<SyncEntityType, keyof DailyWorkDatabase> = {
  task: 'tasks',
  waiting: 'confirmations',
  memo: 'memos',
  routine: 'routines',
  routine_log: 'routine_logs',
  activity: 'activities',
  daily_log: 'daily_logs',
}

const domainTables = [
  'tasks',
  'confirmations',
  'memos',
  'routines',
  'routine_logs',
  'activities',
  'daily_logs',
] as const

interface OwnershipCheckpointSnapshot {
  data: BackupData
  localChanges: unknown[]
  localMutations: unknown[]
  syncMetadata: unknown[]
  deviceStates: unknown[]
  conflicts: unknown[]
  bootstrap: unknown | null
}

export class DexieBootstrapRepository implements BootstrapLocalPort {
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly options: {
      failOwnershipMigration?: boolean
      failCloudReplace?: boolean
      failFinalize?: boolean
    } = {},
  ) {}

  async hasData(userId: string): Promise<boolean> {
    const data = await this.readData(userId)
    return Object.values(data).some((rows) => rows.length > 0)
  }

  async readData(userId: string): Promise<BackupData> {
    const [
      tasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      dailyLogs,
    ] = await Promise.all([
      this.owned<Task>(this.database.tasks, userId),
      this.owned<Waiting>(this.database.confirmations, userId),
      this.owned<Memo>(this.database.memos, userId),
      this.owned<Routine>(this.database.routines, userId),
      this.owned<RoutineLog>(this.database.routine_logs, userId),
      this.owned<Activity>(this.database.activities, userId),
      this.owned<DailyLog>(this.database.daily_logs, userId),
    ])
    return validateBackupData(
      { tasks, waiting, memos, routines, routineLogs, activities, dailyLogs },
      userId,
    )
  }

  async createSnapshot(
    userId: string,
    capturedAt: string,
  ): Promise<BootstrapSnapshot> {
    const progress = await this.database.bootstrap_progress.get(userId)
    if (progress?.mode === 'connect_local') {
      const checkpoint = await this.database.ownership_checkpoints.get(
        progress.bootstrapId,
      )
      if (!checkpoint) throw new Error('Ownership checkpoint was not found.')
      const saved = checkpoint.snapshot as OwnershipCheckpointSnapshot
      const data = structuredClone(saved.data)
      const collections: SyncEntity[][] = [
        data.tasks,
        data.waiting,
        data.memos,
        data.routines,
        data.routineLogs,
        data.activities,
        data.dailyLogs,
      ]
      collections.forEach((entities) =>
        entities.forEach((entity) => {
          entity.userId = userId
        }),
      )
      return {
        format: bootstrapFormat,
        formatVersion: bootstrapFormatVersion,
        ownerId: userId,
        capturedAt,
        data: validateBackupData(data, userId),
      }
    }
    return {
      format: bootstrapFormat,
      formatVersion: bootstrapFormatVersion,
      ownerId: userId,
      capturedAt,
      data: await this.readData(userId),
    }
  }

  getProgress(userId: string) {
    return this.database.bootstrap_progress
      .get(userId)
      .then((value) => (value ? structuredClone(value) : null))
  }

  async getBootstrapState(userId: string) {
    return (await this.database.sync_bootstrap.get(userId))?.state ?? 'clean'
  }

  async initializeEmptyWorkspace(
    userId: string,
    deviceId: string,
    highWatermark: number,
    updatedAt: string,
  ): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.local_changes,
        this.database.local_mutations,
        this.database.sync_metadata,
        this.database.sync_device_state,
        this.database.sync_conflicts,
        this.database.sync_bootstrap,
        this.database.bootstrap_progress,
      ],
      async () => {
        await this.clearTransport(userId)
        await this.database.sync_device_state.put({
          id: syncDeviceStateId(userId, deviceId),
          userId,
          deviceId,
          lastCommitOrder: 0,
          lastPulledRevision: highWatermark,
          updatedAt,
        })
        await this.database.sync_bootstrap.put({
          userId,
          state: 'bootstrapped',
          updatedAt,
        })
        await this.database.bootstrap_progress.delete(userId)
      },
    )
  }

  async migrateOwnership(
    sourceUserId: string,
    targetUserId: string,
    bootstrapId: string,
    deviceId: string,
    updatedAt: string,
  ): Promise<void> {
    const tables = this.allTables()
    await this.database.transaction('rw', tables, async () => {
      if (await this.hasDataInside(targetUserId)) {
        throw new Error('Authenticated local workspace is not empty.')
      }
      const checkpoint: OwnershipCheckpointSnapshot = {
        data: await this.readDataInside(sourceUserId),
        localChanges: await this.owned(
          this.database.local_changes,
          sourceUserId,
        ),
        localMutations: await this.owned(
          this.database.local_mutations,
          sourceUserId,
        ),
        syncMetadata: await this.owned(
          this.database.sync_metadata,
          sourceUserId,
        ),
        deviceStates: await this.owned(
          this.database.sync_device_state,
          sourceUserId,
        ),
        conflicts: await this.owned(this.database.sync_conflicts, sourceUserId),
        bootstrap:
          (await this.database.sync_bootstrap.get(sourceUserId)) ?? null,
      }
      await this.database.ownership_checkpoints.put({
        bootstrapId,
        sourceUserId,
        targetUserId,
        createdAt: updatedAt,
        snapshot: structuredClone(checkpoint),
      })
      await this.rewriteDomainOwner(sourceUserId, targetUserId)
      if (this.options.failOwnershipMigration) {
        throw new Error('Injected ownership migration failure.')
      }
      await this.rewriteTransportOwner(sourceUserId, targetUserId)
      await this.database.sync_bootstrap.delete(sourceUserId)
      await this.database.sync_bootstrap.put({
        userId: targetUserId,
        state: 'requires_bootstrap',
        updatedAt,
      })
      await this.database.bootstrap_progress.put({
        userId: targetUserId,
        bootstrapId,
        sourceUserId,
        deviceId,
        mode: 'connect_local',
        stage: 'ownership_migrated',
        nextChunkIndex: 0,
        totalChunks: 0,
        manifestHash: null,
        serverResult: null,
        highWatermark: null,
        updatedAt,
      })
    })
  }

  async beginCloudRestore(
    sourceUserId: string,
    targetUserId: string,
    bootstrapId: string,
    deviceId: string,
    mode: 'restore_cloud' | 'use_cloud',
    updatedAt: string,
  ): Promise<void> {
    await this.database.bootstrap_progress.put({
      userId: targetUserId,
      bootstrapId,
      sourceUserId,
      deviceId,
      mode,
      stage: 'downloading',
      nextChunkIndex: 0,
      totalChunks: 0,
      manifestHash: null,
      serverResult: null,
      highWatermark: null,
      updatedAt,
    })
  }

  async updateProgress(
    userId: string,
    update: Partial<BootstrapProgressRecord>,
  ): Promise<void> {
    const current = await this.database.bootstrap_progress.get(userId)
    if (!current) throw new Error('Bootstrap progress was not found.')
    await this.database.bootstrap_progress.put({
      ...current,
      ...update,
      userId,
    })
  }

  async rollbackOwnership(userId: string, updatedAt: string): Promise<void> {
    await this.database.transaction('rw', this.allTables(), async () => {
      const progress = await this.database.bootstrap_progress.get(userId)
      if (!progress || progress.mode !== 'connect_local') return
      if (progress.stage !== 'ownership_migrated') {
        throw new Error(
          'Bootstrap has crossed the ownership rollback boundary.',
        )
      }
      const checkpoint = await this.database.ownership_checkpoints.get(
        progress.bootstrapId,
      )
      if (!checkpoint) throw new Error('Ownership checkpoint was not found.')
      const saved = checkpoint.snapshot as OwnershipCheckpointSnapshot
      await this.deleteOwnedDomain(userId)
      await this.clearTransport(userId)
      await this.putData(validateBackupData(saved.data, progress.sourceUserId))
      await this.restoreTransport(progress.sourceUserId, saved)
      await this.database.sync_bootstrap.delete(userId)
      if (saved.bootstrap) {
        await this.database.sync_bootstrap.put(saved.bootstrap as never)
      } else {
        await this.database.sync_bootstrap.put({
          userId: progress.sourceUserId,
          state: 'requires_bootstrap',
          updatedAt,
        })
      }
      await this.database.bootstrap_progress.delete(userId)
      await this.database.ownership_checkpoints.delete(progress.bootstrapId)
    })
  }

  async finalizeUploadedWorkspace(
    userId: string,
    deviceId: string,
    results: MutationEntityResult[],
    highWatermark: number,
    updatedAt: string,
  ): Promise<void> {
    await this.database.transaction('rw', this.allTables(), async () => {
      const progress = await this.database.bootstrap_progress.get(userId)
      if (!progress) throw new Error('Bootstrap progress was not found.')
      const entities = await this.entities(userId)
      const resultMap = new Map(
        results.map((result) => [
          `${result.entityType}:${result.entityId}`,
          result,
        ]),
      )
      if (resultMap.size !== entities.length) {
        throw new Error('Bootstrap acknowledgement is incomplete.')
      }
      await this.clearTransport(userId)
      for (const { entityType, entity } of entities) {
        const result = resultMap.get(`${entityType}:${entity.id}`)
        if (!result) throw new Error('Bootstrap entity result is missing.')
        await this.database.sync_metadata.put({
          id: syncMetadataId(userId, entityType, entity.id),
          userId,
          entityType,
          entityId: entity.id,
          localVersion: entity.version,
          baseServerRevision: result.serverRevision,
          serverRevision: result.serverRevision,
          serverVersion: result.serverVersion,
          lastMutationId: progress.bootstrapId,
          lastAcknowledgedMutationId: progress.bootstrapId,
          lastModifiedByDeviceId: deviceId,
          updatedAt,
        })
      }
      if (this.options.failFinalize) {
        throw new Error('Injected bootstrap finalize failure.')
      }
      await this.finishBootstrap(userId, deviceId, highWatermark, updatedAt)
      await this.database.ownership_checkpoints.delete(progress.bootstrapId)
    })
    this.publishReload()
  }

  async replaceWithCloud(
    sourceUserId: string,
    targetUserId: string,
    deviceId: string,
    rawSnapshot: CloudBootstrapSnapshot,
    updatedAt: string,
  ): Promise<void> {
    const snapshot = validateCloudBootstrapSnapshot(rawSnapshot, targetUserId)
    await this.database.transaction('rw', this.allTables(), async () => {
      await this.deleteOwnedDomain(sourceUserId)
      if (sourceUserId !== targetUserId) await this.clearTransport(sourceUserId)
      await this.deleteOwnedDomain(targetUserId)
      await this.clearTransport(targetUserId)
      for (const entry of snapshot.entries) {
        await this.table(entry.entityType).put(
          structuredClone(entry.entitySnapshot) as never,
        )
        await this.database.sync_metadata.put({
          id: syncMetadataId(targetUserId, entry.entityType, entry.entityId),
          userId: targetUserId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          localVersion: entry.entitySnapshot.version,
          baseServerRevision: entry.serverRevision,
          serverRevision: entry.serverRevision,
          serverVersion: entry.serverVersion,
          lastMutationId: entry.mutationId,
          lastAcknowledgedMutationId: entry.mutationId,
          lastModifiedByDeviceId: entry.deviceId,
          updatedAt: entry.occurredAt,
        })
      }
      if (this.options.failCloudReplace) {
        throw new Error('Injected cloud replace failure.')
      }
      await this.database.sync_bootstrap.delete(sourceUserId)
      await this.finishBootstrap(
        targetUserId,
        deviceId,
        snapshot.highWatermark,
        updatedAt,
      )
    })
    this.publishReload()
  }

  async clearProgress(userId: string): Promise<void> {
    const progress = await this.database.bootstrap_progress.get(userId)
    await this.database.bootstrap_progress.delete(userId)
    if (progress) {
      await this.database.ownership_checkpoints.delete(progress.bootstrapId)
    }
  }

  private async finishBootstrap(
    userId: string,
    deviceId: string,
    highWatermark: number,
    updatedAt: string,
  ) {
    const existing = await this.database.sync_device_state.get(
      syncDeviceStateId(userId, deviceId),
    )
    await this.database.sync_device_state.put({
      id: syncDeviceStateId(userId, deviceId),
      userId,
      deviceId,
      lastCommitOrder: existing?.lastCommitOrder ?? 0,
      lastPulledRevision: highWatermark,
      updatedAt,
    })
    await this.database.sync_bootstrap.put({
      userId,
      state: 'bootstrapped',
      updatedAt,
    })
    await this.database.bootstrap_progress.delete(userId)
  }

  private async clearTransport(userId: string) {
    await Promise.all([
      this.database.local_changes
        .filter((row) => row.userId === userId)
        .delete(),
      this.database.local_mutations
        .filter((row) => row.userId === userId)
        .delete(),
      this.database.sync_metadata
        .filter((row) => row.userId === userId)
        .delete(),
      this.database.sync_device_state
        .filter((row) => row.userId === userId)
        .delete(),
      this.database.sync_conflicts
        .filter((row) => row.userId === userId)
        .delete(),
    ])
  }

  private async rewriteDomainOwner(source: string, target: string) {
    for (const name of domainTables) {
      await this.domainTable(name)
        .filter((row) => row.userId === source)
        .modify((row) => {
          row.userId = target
        })
    }
  }

  private async rewriteTransportOwner(source: string, target: string) {
    await this.database.local_changes
      .filter((row) => row.userId === source)
      .modify((row) => {
        row.userId = target
      })
    await this.database.local_mutations
      .filter((row) => row.userId === source)
      .modify((row) => {
        row.userId = target
        row.changes.forEach((change) => {
          change.entitySnapshot.userId = target
        })
      })
    const metadata = await this.owned(this.database.sync_metadata, source)
    await this.database.sync_metadata.bulkDelete(metadata.map((row) => row.id))
    if (metadata.length) {
      await this.database.sync_metadata.bulkPut(
        metadata.map((row) => ({
          ...row,
          id: syncMetadataId(target, row.entityType, row.entityId),
          userId: target,
        })),
      )
    }
    const states = await this.owned(this.database.sync_device_state, source)
    await this.database.sync_device_state.bulkDelete(
      states.map((row) => row.id),
    )
    if (states.length) {
      await this.database.sync_device_state.bulkPut(
        states.map((row) => ({
          ...row,
          id: syncDeviceStateId(target, row.deviceId),
          userId: target,
        })),
      )
    }
    const conflicts = await this.owned(this.database.sync_conflicts, source)
    await this.database.sync_conflicts.bulkDelete(
      conflicts.map((row) => row.id),
    )
    if (conflicts.length) {
      await this.database.sync_conflicts.bulkPut(
        conflicts.map((row) => ({
          ...row,
          id: row.id.startsWith(`${source}:`)
            ? `${target}:${row.id.slice(source.length + 1)}`
            : row.id,
          userId: target,
          remoteChange: {
            ...row.remoteChange,
            userId: target,
            entity: { ...row.remoteChange.entity, userId: target },
          },
        })),
      )
    }
  }

  private async restoreTransport(
    userId: string,
    snapshot: OwnershipCheckpointSnapshot,
  ) {
    if (snapshot.localChanges.length)
      await this.database.local_changes.bulkPut(
        snapshot.localChanges as never[],
      )
    if (snapshot.localMutations.length)
      await this.database.local_mutations.bulkPut(
        snapshot.localMutations as never[],
      )
    if (snapshot.syncMetadata.length)
      await this.database.sync_metadata.bulkPut(
        snapshot.syncMetadata as never[],
      )
    if (snapshot.deviceStates.length)
      await this.database.sync_device_state.bulkPut(
        snapshot.deviceStates as never[],
      )
    if (snapshot.conflicts.length)
      await this.database.sync_conflicts.bulkPut(snapshot.conflicts as never[])
    void userId
  }

  private async readDataInside(userId: string): Promise<BackupData> {
    const data = await this.rawData(userId)
    return validateBackupData(data, userId)
  }

  private rawData(userId: string): Promise<BackupData> {
    return Promise.all([
      this.owned<Task>(this.database.tasks, userId),
      this.owned<Waiting>(this.database.confirmations, userId),
      this.owned<Memo>(this.database.memos, userId),
      this.owned<Routine>(this.database.routines, userId),
      this.owned<RoutineLog>(this.database.routine_logs, userId),
      this.owned<Activity>(this.database.activities, userId),
      this.owned<DailyLog>(this.database.daily_logs, userId),
    ]).then(
      ([
        tasks,
        waiting,
        memos,
        routines,
        routineLogs,
        activities,
        dailyLogs,
      ]) => ({
        tasks,
        waiting,
        memos,
        routines,
        routineLogs,
        activities,
        dailyLogs,
      }),
    )
  }

  private hasDataInside(userId: string) {
    return Promise.all(
      domainTables.map((name) =>
        this.database[name].filter((row) => row.userId === userId).count(),
      ),
    ).then((counts) => counts.some(Boolean))
  }

  private async deleteOwnedDomain(userId: string) {
    for (const name of domainTables) {
      await this.database[name].filter((row) => row.userId === userId).delete()
    }
  }

  private async putData(data: BackupData) {
    await Promise.all([
      data.tasks.length ? this.database.tasks.bulkPut(data.tasks) : undefined,
      data.waiting.length
        ? this.database.confirmations.bulkPut(data.waiting)
        : undefined,
      data.memos.length ? this.database.memos.bulkPut(data.memos) : undefined,
      data.routines.length
        ? this.database.routines.bulkPut(data.routines)
        : undefined,
      data.routineLogs.length
        ? this.database.routine_logs.bulkPut(data.routineLogs)
        : undefined,
      data.activities.length
        ? this.database.activities.bulkPut(data.activities)
        : undefined,
      data.dailyLogs.length
        ? this.database.daily_logs.bulkPut(data.dailyLogs)
        : undefined,
    ])
  }

  private async entities(userId: string) {
    const data = await this.rawData(userId)
    return [
      ...data.tasks.map((entity) => ({ entityType: 'task' as const, entity })),
      ...data.waiting.map((entity) => ({
        entityType: 'waiting' as const,
        entity,
      })),
      ...data.memos.map((entity) => ({ entityType: 'memo' as const, entity })),
      ...data.routines.map((entity) => ({
        entityType: 'routine' as const,
        entity,
      })),
      ...data.routineLogs.map((entity) => ({
        entityType: 'routine_log' as const,
        entity,
      })),
      ...data.activities.map((entity) => ({
        entityType: 'activity' as const,
        entity,
      })),
      ...data.dailyLogs.map((entity) => ({
        entityType: 'daily_log' as const,
        entity,
      })),
    ]
  }

  private table(entityType: SyncEntityType): Table<SyncEntity, string> {
    return this.database[stores[entityType]] as unknown as Table<
      SyncEntity,
      string
    >
  }

  private owned<T extends { userId: string }>(
    table: OwnedTable<T>,
    userId: string,
  ) {
    return table
      .filter((row) => row.userId === userId)
      .toArray()
      .then((rows) => structuredClone(rows))
  }

  private domainTable(name: (typeof domainTables)[number]) {
    return this.database[name] as unknown as Table<
      { id: string; userId: string },
      string
    >
  }

  private allTables() {
    return [
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
  }

  private publishReload() {
    domainTables.forEach((store) =>
      this.database.changes.publish({
        store,
        entityId: 'bootstrap',
        entityVersion: 1,
      }),
    )
  }
}
