import type { LocalMutationRecord, MutationAck } from '@/sync/contracts'

export interface CloudWorkspaceInspection {
  hasData: boolean
  highWatermark: number
}

export interface CloudChangePage {
  changes: ReadonlyArray<Record<string, unknown>>
  highWatermark: number
}

export interface BootstrapBeginRequest {
  bootstrapId: string
  deviceId: string
  manifestHash: string
  totalChunks: number
}

export interface BootstrapChunkRequest {
  bootstrapId: string
  chunkIndex: number
  idempotencyKey: string
  payload: Readonly<Record<string, unknown>>
}

export interface CloudSyncPort {
  inspectCloudWorkspace(): Promise<CloudWorkspaceInspection>
  getRemoteHighWatermark(): Promise<number>
  pullRemotePage(
    afterRevision: number,
    limit?: number,
  ): Promise<CloudChangePage>
  submitMutation(mutation: LocalMutationRecord): Promise<MutationAck>
  queryMutationResult(mutationId: string): Promise<MutationAck | null>
  beginBootstrap(request: BootstrapBeginRequest): Promise<unknown>
  uploadBootstrapChunk(request: BootstrapChunkRequest): Promise<unknown>
  commitBootstrap(bootstrapId: string): Promise<unknown>
}

export class CloudPortError extends Error {
  constructor(
    public readonly operation: string,
    public readonly safeCode: string,
  ) {
    super(`Cloud operation failed: ${safeCode}`)
    this.name = 'CloudPortError'
  }
}
