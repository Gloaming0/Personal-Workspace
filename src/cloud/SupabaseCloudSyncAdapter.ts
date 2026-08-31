import type { LocalMutationRecord, MutationAck } from '@/sync/contracts'
import {
  CloudPortError,
  type BootstrapBeginRequest,
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

function objectResult(value: unknown, operation: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloudPortError(operation, 'invalid_response')
  }
  return value as Record<string, unknown>
}

export class SupabaseCloudSyncAdapter implements CloudSyncPort {
  constructor(private readonly client: RpcClient) {}

  private async call(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(functionName, parameters)
    if (error) {
      throw new CloudPortError(functionName, error.code ?? 'request_failed')
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
        ? (result.changes as ReadonlyArray<Record<string, unknown>>)
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

  beginBootstrap(request: BootstrapBeginRequest): Promise<unknown> {
    return this.call('begin_sync_bootstrap_v1', {
      p_bootstrap_id: request.bootstrapId,
      p_device_id: request.deviceId,
      p_manifest_hash: request.manifestHash,
      p_total_chunks: request.totalChunks,
    })
  }

  uploadBootstrapChunk(request: BootstrapChunkRequest): Promise<unknown> {
    return this.call('upload_sync_bootstrap_chunk_v1', {
      p_bootstrap_id: request.bootstrapId,
      p_chunk_index: request.chunkIndex,
      p_idempotency_key: request.idempotencyKey,
      p_payload: request.payload,
    })
  }

  commitBootstrap(bootstrapId: string): Promise<unknown> {
    return this.call('commit_sync_bootstrap_v1', {
      p_bootstrap_id: bootstrapId,
    })
  }
}
