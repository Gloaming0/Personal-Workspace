import type {
  LocalMutationRecord,
  MutationAck,
  RemoteEntityChange,
} from '@/sync/contracts'
import type { UserId } from '@/domain/shared'
import type {
  BootstrapEntityEntry,
  BootstrapCommitResult,
  CloudBootstrapSnapshot,
} from '@/features/bootstrap/model'
import type { SyncEntityType } from '@/sync/contracts'
import {
  CloudPortError,
  type BootstrapBeginRequest,
  type BootstrapBeginResult,
  type BootstrapChunkRequest,
  type CloudChangePage,
  type CloudSyncPort,
  type CloudWorkspaceInspection,
} from './contracts'

interface RpcError {
  code?: string
  message: string
}

export interface RpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>
}

const safeServerErrors = new Set([
  'AuthenticationRequired',
  'OwnershipConflict',
  'MutationIdReuse',
  'BaseServerRevisionConflict',
  'ImmutableEntityConflict',
  'DuplicateUniqueInvariant',
])

function objectResult(value: unknown, operation: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudPortError(operation, 'invalid_response')
  }
  return value as Record<string, unknown>
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function remoteEntity(
  entityType: SyncEntityType,
  record: Record<string, unknown>,
): BootstrapEntityEntry['entitySnapshot'] {
  const shared = {
    id: String(record.id),
    userId: String(record.user_id),
    version: Number(record.version),
    createdAt: String(record.created_at),
    updatedAt: String(record.updated_at),
    deletedAt: stringOrNull(record.deleted_at),
  }
  if (entityType === 'task') {
    return {
      ...shared,
      title: String(record.title),
      notes: stringOrNull(record.notes),
      status: String(record.status) as never,
      priority: String(record.priority) as never,
      plannedDate: stringOrNull(record.planned_date),
      dueAt: stringOrNull(record.due_at),
      projectId: stringOrNull(record.project_id),
      focusDate: stringOrNull(record.focus_date),
      focusOrder:
        record.focus_order === null
          ? null
          : (Number(record.focus_order) as 1 | 2 | 3),
      completedAt: stringOrNull(record.completed_at),
    }
  }
  if (entityType === 'waiting') {
    return {
      ...shared,
      title: String(record.title),
      notes: stringOrNull(record.notes),
      status: String(record.status) as never,
      person: String(record.person),
      projectId: stringOrNull(record.project_id),
      sourceTaskId: stringOrNull(record.source_task_id),
      sentAt: String(record.sent_at),
      followUpDate: stringOrNull(record.follow_up_date),
      confirmedAt: stringOrNull(record.confirmed_at),
      closedAt: stringOrNull(record.closed_at),
    }
  }
  if (entityType === 'memo') {
    return {
      ...shared,
      content: String(record.content),
      pinned: record.pinned === true,
      projectId: stringOrNull(record.project_id),
    }
  }
  if (entityType === 'routine') {
    return {
      ...shared,
      title: String(record.title),
      status: String(record.status) as never,
      schedule: record.schedule as never,
      timezone: String(record.timezone),
      sortOrder: Number(record.sort_order),
    }
  }
  if (entityType === 'routine_log') {
    return {
      ...shared,
      routineId: String(record.routine_id),
      date: String(record.date),
      completedAt: String(record.completed_at),
    }
  }
  if (entityType === 'activity') {
    return {
      ...shared,
      eventType: String(record.event_type) as never,
      entityType: String(record.entity_type) as never,
      entityId: String(record.entity_id),
      payload: record.payload as never,
      deviceId: stringOrNull(record.device_id),
      occurredAt: String(record.occurred_at),
    }
  }
  return {
    ...shared,
    date: String(record.date),
    finalizeTimezone: String(record.finalize_timezone),
    summary: String(record.summary),
    snapshot: record.snapshot as never,
    finalizedAt: String(record.finalized_at),
  }
}

function remoteChange(raw: Record<string, unknown>): RemoteEntityChange {
  const entityType = String(raw.entity_type) as SyncEntityType
  const record = objectResult(raw.record, 'pull_sync_changes_v1.record')
  return {
    userId: String(raw.user_id),
    entityType,
    entity: remoteEntity(entityType, record),
    operation: String(raw.operation) as RemoteEntityChange['operation'],
    baseServerRevision: null,
    serverRevision: Number(raw.server_revision),
    serverVersion: Number(record.version),
    mutationId: String(raw.mutation_id),
    deviceId: String(raw.device_id),
    occurredAt: String(raw.server_changed_at),
  }
}

export class SupabaseCloudSyncAdapter implements CloudSyncPort {
  constructor(private readonly client: RpcClient) {}

  private async call(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(functionName, parameters)
    if (error) {
      const safeCode = safeServerErrors.has(error.message)
        ? error.message
        : (error.code ?? 'request_failed')
      throw new CloudPortError(functionName, safeCode)
    }
    return data
  }

  async inspectCloudWorkspace(): Promise<CloudWorkspaceInspection> {
    const result = objectResult(
      await this.call('inspect_cloud_workspace_v1'),
      'inspect_cloud_workspace_v1',
    )
    return {
      hasData: result.hasData === true,
      highWatermark: Number(result.highWatermark ?? 0),
    }
  }

  async resolveDailyLogConflict(request: {
    resolutionId: string
    deviceId: string
    candidate: import('@/domain/shared').SyncEntity
  }): Promise<void> {
    await this.call('resolve_daily_log_conflict_v1', {
      p_request: {
        resolutionId: request.resolutionId,
        deviceId: request.deviceId,
        candidate: request.candidate,
      },
    })
  }

  async getRemoteHighWatermark(): Promise<number> {
    return (await this.inspectCloudWorkspace()).highWatermark
  }

  async pullRemotePage(
    afterRevision: number,
    limit = 100,
  ): Promise<CloudChangePage> {
    const result = objectResult(
      await this.call('pull_sync_changes_v1', {
        p_after_revision: afterRevision,
        p_limit: limit,
      }),
      'pull_sync_changes_v1',
    )
    return {
      changes: Array.isArray(result.changes)
        ? (result.changes as Record<string, unknown>[]).map(remoteChange)
        : [],
      highWatermark: Number(result.highWatermark ?? 0),
    }
  }

  async submitMutation(mutation: LocalMutationRecord): Promise<MutationAck> {
    const result = objectResult(
      await this.call('apply_sync_mutation_v1', {
        p_request: {
          mutationId: mutation.mutationId,
          deviceId: mutation.deviceId,
          userId: mutation.userId,
          occurredAt: mutation.occurredAt,
          commitOrder: mutation.commitOrder,
          changes: mutation.changes,
        },
      }),
      'apply_sync_mutation_v1',
    )
    return {
      mutationId: String(result.mutationId),
      entityResults: Array.isArray(result.entityResults)
        ? (result.entityResults as MutationAck['entityResults'])
        : [],
    }
  }

  async queryMutationResult(mutationId: string): Promise<MutationAck | null> {
    const value = await this.call('query_sync_mutation_result_v1', {
      p_mutation_id: mutationId,
    })
    if (value === null) return null
    const result = objectResult(value, 'query_sync_mutation_result_v1')
    return {
      mutationId: String(result.mutationId),
      entityResults: Array.isArray(result.entityResults)
        ? (result.entityResults as MutationAck['entityResults'])
        : [],
    }
  }

  async beginBootstrap(
    request: BootstrapBeginRequest,
  ): Promise<BootstrapBeginResult> {
    const result = objectResult(
      await this.call('begin_sync_bootstrap_v1', {
        p_bootstrap_id: request.bootstrapId,
        p_device_id: request.deviceId,
        p_manifest_hash: request.manifestHash,
        p_total_chunks: request.totalChunks,
      }),
      'begin_sync_bootstrap_v1',
    )
    return {
      bootstrapId: String(result.bootstrapId),
      status: result.status === 'committed' ? 'committed' : 'staging',
    }
  }

  uploadBootstrapChunk(request: BootstrapChunkRequest): Promise<unknown> {
    return this.call('upload_sync_bootstrap_chunk_v1', {
      p_bootstrap_id: request.bootstrapId,
      p_chunk_index: request.chunkIndex,
      p_idempotency_key: request.idempotencyKey,
      p_payload: request.payload,
    })
  }

  async commitBootstrap(bootstrapId: string): Promise<BootstrapCommitResult> {
    const result = objectResult(
      await this.call('commit_sync_bootstrap_v1', {
        p_bootstrap_id: bootstrapId,
      }),
      'commit_sync_bootstrap_v1',
    )
    return {
      bootstrapId: String(result.bootstrapId),
      status: 'committed',
      entityCount: Number(result.entityCount),
      entityResults: Array.isArray(result.entityResults)
        ? (result.entityResults as BootstrapCommitResult['entityResults'])
        : [],
      highWatermark: Number(result.highWatermark),
    }
  }

  async downloadBootstrapSnapshot(
    userId: UserId,
  ): Promise<CloudBootstrapSnapshot> {
    let cursor = 0
    let highWatermark: number
    const latest = new Map<string, CloudBootstrapSnapshot['entries'][number]>()
    do {
      const page = await this.pullRemotePage(cursor, 500)
      highWatermark = page.highWatermark
      for (const change of page.changes) {
        const entityType = change.entityType
        const entry = {
          entityType,
          entityId: change.entity.id,
          entitySnapshot:
            change.entity as BootstrapEntityEntry['entitySnapshot'],
          serverRevision: change.serverRevision,
          serverVersion: change.serverVersion,
          mutationId: change.mutationId,
          deviceId: change.deviceId,
          occurredAt: change.occurredAt,
        }
        latest.set(`${entityType}:${entry.entityId}`, entry)
        cursor = Math.max(cursor, entry.serverRevision)
      }
      if (page.changes.length === 0) cursor = highWatermark
    } while (cursor < highWatermark)
    return {
      ownerId: userId,
      highWatermark,
      capturedAt: new Date().toISOString(),
      entries: [...latest.values()].sort(
        (left, right) => left.serverRevision - right.serverRevision,
      ),
    }
  }
}
