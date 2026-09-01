import type { Table } from 'dexie'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import type { LocalChangeStore } from '@/database/LocalChangeCoordinator'
import type { RoutineLog, Task } from '@/domain/entities'
import type { SyncEntity } from '@/domain/shared'
import type { DeviceIdentityProvider } from '@/sync/DeviceIdentityStore'
import { DeviceIdentityStore } from '@/sync/DeviceIdentityStore'
import type {
  ConflictResolutionAction,
  ConflictResolutionCommand,
  ConflictResolutionPort,
  ConflictResolutionResult,
  LocalMutationRecord,
  MutationEntityChange,
  PersistedSyncConflict,
  SyncEntityType,
  SyncMetadata,
} from '@/sync/contracts'
import {
  mutationEntityKey,
  syncDeviceStateId,
  syncMetadataId,
} from '@/sync/journal'

type ResolutionEntity = SyncEntity & Record<string, unknown>

const stores: Record<SyncEntityType, LocalChangeStore> = {
  task: 'tasks',
  waiting: 'confirmations',
  memo: 'memos',
  routine: 'routines',
  routine_log: 'routine_logs',
  activity: 'activities',
  daily_log: 'daily_logs',
}

const keepLocalActions = new Set<ConflictResolutionAction>([
  'keep_mine',
  'keep_deleted',
  'keep_local_daily_log',
  'keep_local_routine_log',
])

const useRemoteActions = new Set<ConflictResolutionAction>([
  'use_remote',
  'restore_remote',
  'keep_remote_daily_log',
  'keep_remote_routine_log',
])

export interface DexieConflictResolutionOptions {
  deviceIdentity?: DeviceIdentityProvider
  now?: () => string
}

export class DexieConflictResolutionRepository implements ConflictResolutionPort {
  private readonly deviceIdentity: DeviceIdentityProvider
  private readonly now: () => string

  constructor(
    private readonly database: DailyWorkDatabase,
    options: DexieConflictResolutionOptions = {},
  ) {
    this.deviceIdentity = options.deviceIdentity ?? new DeviceIdentityStore()
    this.now = options.now ?? (() => new Date().toISOString())
  }

  async getProposal(userId: string, conflictId: string) {
    const conflict = await this.database.sync_conflicts.get(conflictId)
    if (!conflict || conflict.userId !== userId)
      throw new Error('ConflictNotFound')
    const mutation = conflict.mutationId
      ? await this.database.local_mutations.get(conflict.mutationId)
      : null
    const mutationCandidate = mutation?.changes.find(
      (change) => change.entityType === conflict.entityType,
    )?.entitySnapshot
    const localCandidate =
      mutationCandidate ??
      (await this.table(conflict.entityType).get(conflict.entityId))
    return {
      conflict: structuredClone(conflict),
      localCandidate:
        localCandidate?.userId === userId
          ? structuredClone(localCandidate)
          : null,
    }
  }

  async resolve(
    command: ConflictResolutionCommand,
  ): Promise<ConflictResolutionResult> {
    this.database.runtime.assertWritable()
    const published: Array<{ entityType: SyncEntityType; entity: SyncEntity }> =
      []
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
        this.database.conflict_resolutions,
      ],
      async () => {
        const replay = await this.database.conflict_resolutions.get(
          command.resolutionId,
        )
        if (replay) {
          if (
            replay.userId !== command.userId ||
            replay.conflictId !== command.conflictId ||
            replay.action !== command.action ||
            replay.mutationId !== command.mutationId
          ) {
            throw new Error('ResolutionIdReuse')
          }
          return this.result(replay, false, 0)
        }
        const conflict = await this.database.sync_conflicts.get(
          command.conflictId,
        )
        if (!conflict || conflict.userId !== command.userId) {
          throw new Error('ConflictNotFound')
        }
        if (conflict.conflict.type === 'OwnershipConflict') {
          throw new Error('OwnershipConflictRequiresBootstrap')
        }
        if (conflict.status === 'resolved') {
          throw new Error('ConflictAlreadyResolved')
        }
        this.assertAllowed(conflict, command.action)

        let mutation: LocalMutationRecord | null = null
        let blockedSuccessorCount = 0
        if (command.action === 'repair_focus') {
          mutation = await this.repairFocus(conflict, command, published)
        } else if (
          conflict.conflict.type === 'DuplicateUniqueInvariant' &&
          conflict.conflict.invariant === 'routine_log'
        ) {
          mutation = await this.resolveRoutineLog(conflict, command, published)
        } else if (command.action === 'keep_local_daily_log') {
          blockedSuccessorCount = await this.supersedeSafeChain(conflict)
        } else if (keepLocalActions.has(command.action)) {
          const prepared = await this.keepLocal(conflict, command)
          mutation = prepared.mutation
          blockedSuccessorCount = prepared.blockedSuccessorCount
        } else if (useRemoteActions.has(command.action)) {
          blockedSuccessorCount = await this.useRemote(conflict, published)
        }

        if (mutation) await this.persistMutation(mutation)
        const createdAt = this.now()
        await this.database.sync_conflicts.update(conflict.id, {
          status: 'resolved',
          resolvedAt: createdAt,
          resolutionId: command.resolutionId,
          resolutionAction: command.action,
        })
        const receipt = {
          resolutionId: command.resolutionId,
          userId: command.userId,
          conflictId: command.conflictId,
          action: command.action,
          mutationId: mutation?.mutationId ?? null,
          status: 'committed' as const,
          createdAt,
        }
        await this.database.conflict_resolutions.add(receipt)
        return this.result(receipt, mutation !== null, blockedSuccessorCount)
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

  private async keepLocal(
    conflict: PersistedSyncConflict,
    command: ConflictResolutionCommand,
  ) {
    if (!command.mutationId) throw new Error('ResolutionMutationRequired')
    const current = await this.table(conflict.entityType).get(conflict.entityId)
    if (!current || current.userId !== command.userId) {
      throw new Error('LocalCandidateNotFound')
    }
    const blockedSuccessorCount = await this.supersedeSafeChain(conflict)
    const change = this.changeFromSnapshot(
      conflict.entityType,
      current,
      conflict.remoteChange.serverRevision,
      null,
    )
    return {
      mutation: await this.newMutation(command, [change]),
      blockedSuccessorCount,
    }
  }

  private async useRemote(
    conflict: PersistedSyncConflict,
    published: Array<{ entityType: SyncEntityType; entity: SyncEntity }>,
  ): Promise<number> {
    const blocked = await this.supersedeSafeChain(conflict)
    const remote = structuredClone(
      conflict.remoteChange.entity,
    ) as ResolutionEntity
    if (conflict.entityType === 'daily_log') {
      const date = String(remote.date)
      const peer = await this.database.daily_logs
        .filter(
          (log) =>
            log.userId === conflict.userId &&
            log.id !== remote.id &&
            log.deletedAt === null &&
            log.date === date,
        )
        .first()
      if (peer) await this.database.daily_logs.delete(peer.id)
    }
    await this.table(conflict.entityType).put(remote)
    await this.database.sync_metadata.put(this.remoteMetadata(conflict, remote))
    published.push({ entityType: conflict.entityType, entity: remote })
    return blocked
  }

  private async repairFocus(
    conflict: PersistedSyncConflict,
    command: ConflictResolutionCommand,
    published: Array<{ entityType: SyncEntityType; entity: SyncEntity }>,
  ): Promise<LocalMutationRecord> {
    if (!command.mutationId) throw new Error('ResolutionMutationRequired')
    const remote = conflict.remoteChange.entity as Task
    if (!remote.focusDate) throw new Error('FocusConflictHasNoDate')
    const selected = command.focusTaskIds ?? []
    const existing = await this.database.tasks
      .filter(
        (task) =>
          task.userId === command.userId &&
          task.deletedAt === null &&
          task.focusDate === remote.focusDate,
      )
      .toArray()
    const byId = new Map(existing.map((task) => [task.id, task]))
    byId.set(remote.id, structuredClone(remote))
    if (selected.some((id) => !byId.has(id)))
      throw new Error('UnknownFocusTask')
    await this.supersedeSafeChain(conflict)
    for (const id of byId.keys()) {
      await this.supersedeMutationsForEntity(command.userId, 'task', id)
    }
    const changes: MutationEntityChange[] = []
    for (const [id, source] of byId) {
      const order = selected.indexOf(id)
      const next = {
        ...source,
        focusDate: order >= 0 ? remote.focusDate : null,
        focusOrder: order >= 0 ? ((order + 1) as 1 | 2 | 3) : null,
        version: source.version + 1,
        updatedAt: this.now(),
      }
      const metadata = await this.database.sync_metadata.get(
        syncMetadataId(command.userId, 'task', id),
      )
      if (
        next.focusDate === source.focusDate &&
        next.focusOrder === source.focusOrder &&
        metadata?.serverRevision !== null &&
        metadata?.serverRevision !== undefined
      )
        continue
      await this.database.tasks.put(next)
      changes.push(
        this.changeFromSnapshot(
          'task',
          next,
          id === remote.id
            ? conflict.remoteChange.serverRevision
            : (metadata?.serverRevision ?? null),
          null,
          source.version,
        ),
      )
      published.push({ entityType: 'task', entity: next })
    }
    if (changes.length === 0) throw new Error('FocusResolutionHasNoChanges')
    return this.newMutation(command, changes)
  }

  private async resolveRoutineLog(
    conflict: PersistedSyncConflict,
    command: ConflictResolutionCommand,
    published: Array<{ entityType: SyncEntityType; entity: SyncEntity }>,
  ): Promise<LocalMutationRecord | null> {
    const remote = structuredClone(conflict.remoteChange.entity) as RoutineLog
    const peer = await this.database.routine_logs
      .filter(
        (row) =>
          row.userId === command.userId &&
          row.id !== remote.id &&
          row.deletedAt === null &&
          row.routineId === remote.routineId &&
          row.date === remote.date,
      )
      .first()
    if (command.action === 'keep_remote_routine_log') {
      if (peer) {
        await this.supersedeMutationsForEntity(
          command.userId,
          'routine_log',
          peer.id,
        )
        await this.database.routine_logs.delete(peer.id)
      }
      await this.database.routine_logs.put(remote)
      await this.database.sync_metadata.put(
        this.remoteMetadata(conflict, remote),
      )
      published.push({ entityType: 'routine_log', entity: remote })
      return null
    }
    if (!peer || !command.mutationId) throw new Error('LocalCandidateNotFound')
    const tombstone = {
      ...remote,
      deletedAt: this.now(),
      updatedAt: this.now(),
      version: remote.version + 1,
    }
    await this.database.routine_logs.put(tombstone)
    published.push({ entityType: 'routine_log', entity: tombstone })
    return this.newMutation(command, [
      this.changeFromSnapshot(
        'routine_log',
        tombstone,
        conflict.remoteChange.serverRevision,
        null,
        remote.version,
      ),
    ])
  }

  private async supersedeSafeChain(
    conflict: PersistedSyncConflict,
  ): Promise<number> {
    if (!conflict.mutationId) return 0
    const root = await this.database.local_mutations.get(conflict.mutationId)
    const rootChange = root?.changes.find(
      (change) => change.entityType === conflict.entityType,
    )
    const targetType = rootChange?.entityType ?? conflict.entityType
    const targetId = rootChange?.entityId ?? conflict.entityId
    const queue = [conflict.mutationId]
    let blocked = 0
    const visited = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const mutation = await this.database.local_mutations.get(id)
      if (!mutation || mutation.userId !== conflict.userId) continue
      const safe =
        mutation.changes.length === 1 &&
        mutation.changes[0]!.entityType === targetType &&
        mutation.changes[0]!.entityId === targetId
      await this.database.local_mutations.update(id, {
        status: safe ? 'superseded' : 'conflicted',
        failureCode: safe
          ? 'resolved_by_replacement'
          : 'causal_rebase_required',
      })
      if (!safe) {
        blocked += 1
        continue
      }
      const candidates = await this.database.local_mutations
        .where('entityKeys')
        .equals(mutationEntityKey(targetType, targetId))
        .and(
          (candidate) =>
            candidate.userId === conflict.userId &&
            candidate.changes.some(
              (change) => change.predecessorMutationId === id,
            ),
        )
        .toArray()
      queue.push(...candidates.map((candidate) => candidate.mutationId))
    }
    return blocked
  }

  private async supersedeMutationsForEntity(
    userId: string,
    entityType: SyncEntityType,
    entityId: string,
  ) {
    await this.database.local_mutations
      .where('entityKeys')
      .equals(mutationEntityKey(entityType, entityId))
      .and(
        (mutation) =>
          mutation.userId === userId &&
          ['pending', 'in_flight', 'conflicted'].includes(mutation.status),
      )
      .modify({ status: 'superseded', failureCode: 'resolved_by_replacement' })
  }

  private async newMutation(
    command: ConflictResolutionCommand,
    changes: MutationEntityChange[],
  ): Promise<LocalMutationRecord> {
    if (!command.mutationId) throw new Error('ResolutionMutationRequired')
    return {
      mutationId: command.mutationId,
      userId: command.userId,
      deviceId: this.deviceIdentity.getDeviceId(),
      occurredAt: this.now(),
      commitOrder: 0,
      entityKeys: changes.map((change) =>
        mutationEntityKey(change.entityType, change.entityId),
      ),
      changes: changes.map((change, index) => ({
        ...change,
        sequence: index + 1,
      })),
      status: 'pending',
      acknowledgedAt: null,
      entityResults: [],
      failureCode: null,
    }
  }

  private async persistMutation(mutation: LocalMutationRecord): Promise<void> {
    if (await this.database.local_mutations.get(mutation.mutationId)) {
      throw new Error('ResolutionMutationIdReuse')
    }
    const stateId = syncDeviceStateId(mutation.userId, mutation.deviceId)
    const state = await this.database.sync_device_state.get(stateId)
    mutation.commitOrder = (state?.lastCommitOrder ?? 0) + 1
    await this.database.local_mutations.add(mutation)
    for (const change of mutation.changes) {
      const id = syncMetadataId(
        mutation.userId,
        change.entityType,
        change.entityId,
      )
      const current = await this.database.sync_metadata.get(id)
      await this.database.sync_metadata.put({
        id,
        userId: mutation.userId,
        entityType: change.entityType,
        entityId: change.entityId,
        localVersion: change.resultingLocalVersion,
        baseServerRevision: change.baseServerRevision,
        serverRevision: change.baseServerRevision,
        serverVersion: current?.serverVersion ?? null,
        lastMutationId: mutation.mutationId,
        lastAcknowledgedMutationId: current?.lastAcknowledgedMutationId ?? null,
        lastModifiedByDeviceId: mutation.deviceId,
        updatedAt: mutation.occurredAt,
      })
    }
    await this.database.sync_device_state.put({
      id: stateId,
      userId: mutation.userId,
      deviceId: mutation.deviceId,
      lastCommitOrder: mutation.commitOrder,
      lastPulledRevision: state?.lastPulledRevision ?? 0,
      updatedAt: mutation.occurredAt,
    })
  }

  private changeFromSnapshot(
    entityType: SyncEntityType,
    entity: SyncEntity,
    baseServerRevision: number | null,
    predecessorMutationId: string | null,
    baseLocalVersion = Math.max(0, entity.version - 1),
  ): MutationEntityChange {
    return {
      sequence: 1,
      entityType,
      entityId: entity.id,
      operation:
        entity.deletedAt !== null
          ? 'delete'
          : baseServerRevision === null
            ? 'create'
            : 'update',
      baseServerRevision,
      baseLocalVersion,
      resultingLocalVersion: entity.version,
      predecessorMutationId,
      entitySnapshot: structuredClone(entity),
    }
  }

  private remoteMetadata(
    conflict: PersistedSyncConflict,
    entity: SyncEntity,
  ): SyncMetadata {
    const remote = conflict.remoteChange
    return {
      id: syncMetadataId(conflict.userId, conflict.entityType, entity.id),
      userId: conflict.userId,
      entityType: conflict.entityType,
      entityId: entity.id,
      localVersion: entity.version,
      baseServerRevision: remote.serverRevision,
      serverRevision: remote.serverRevision,
      serverVersion: remote.serverVersion,
      lastMutationId: remote.mutationId,
      lastAcknowledgedMutationId: remote.mutationId,
      lastModifiedByDeviceId: remote.deviceId,
      updatedAt: remote.occurredAt,
    }
  }

  private assertAllowed(
    conflict: PersistedSyncConflict,
    action: ConflictResolutionAction,
  ) {
    const type = conflict.conflict.type
    const valid =
      (type === 'SameBaseConcurrentEdit' &&
        ['keep_mine', 'use_remote'].includes(action)) ||
      (type === 'DeleteVsUpdate' &&
        ['keep_deleted', 'restore_remote'].includes(action)) ||
      (type === 'ImmutableDailyLogConflict' &&
        ['keep_local_daily_log', 'keep_remote_daily_log'].includes(action)) ||
      (type === 'DuplicateUniqueInvariant' &&
        ((conflict.conflict.invariant === 'focus' &&
          action === 'repair_focus') ||
          (conflict.conflict.invariant === 'routine_log' &&
            ['keep_local_routine_log', 'keep_remote_routine_log'].includes(
              action,
            )) ||
          (conflict.conflict.invariant === 'daily_log' &&
            ['keep_local_daily_log', 'keep_remote_daily_log'].includes(
              action,
            ))))
    if (!valid) throw new Error('ResolutionActionNotAllowed')
  }

  private table(entityType: SyncEntityType): Table<ResolutionEntity, string> {
    return this.database.table(String(stores[entityType]))
  }

  private result(
    receipt: {
      resolutionId: string
      conflictId: string
      mutationId: string | null
    },
    createdMutation: boolean,
    blockedSuccessorCount: number,
  ): ConflictResolutionResult {
    return { ...receipt, createdMutation, blockedSuccessorCount }
  }
}
