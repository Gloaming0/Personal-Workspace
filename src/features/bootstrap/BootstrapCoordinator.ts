import type { CloudSyncPort } from '@/cloud/contracts'
import type { DeviceIdentityProvider } from '@/sync/DeviceIdentityStore'
import type { SafetyBackupSink } from '@/features/backup/contracts'
import type { BackupService } from '@/features/backup/BackupService'
import type { BootstrapDiscoveryResult, BootstrapLocalPort } from './contracts'
import {
  bootstrapChunkSize,
  flattenBootstrapSnapshot,
  type BootstrapChunk,
  type BootstrapCommitResult,
} from './model'
import { validateBootstrapSnapshot } from './validation'

export type BootstrapUiStage =
  | 'detecting'
  | 'decision'
  | 'safety_backup'
  | 'preparing'
  | 'uploading'
  | 'downloading'
  | 'finalizing'
  | 'complete'
  | 'error'

export interface BootstrapCoordinatorOptions {
  now?: () => string
  createId?: () => string
  chunkSize?: number
  digest?: (value: string) => Promise<string>
  onStage?: (stage: BootstrapUiStage) => void
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function uuidFromHash(hash: string): string {
  const value = hash.padEnd(32, '0').slice(0, 32).split('')
  value[12] = '5'
  value[16] = ['8', '9', 'a', 'b'][Number.parseInt(value[16]!, 16) % 4]!
  const compact = value.join('')
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}

export class BootstrapCoordinator {
  private readonly now: () => string
  private readonly createId: () => string
  private readonly chunkSize: number
  private readonly digest: (value: string) => Promise<string>
  private readonly onStage: (stage: BootstrapUiStage) => void

  constructor(
    private readonly local: BootstrapLocalPort,
    private readonly cloud: CloudSyncPort,
    private readonly backups: BackupService,
    private readonly deviceIdentity: DeviceIdentityProvider,
    options: BootstrapCoordinatorOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.chunkSize = options.chunkSize ?? bootstrapChunkSize
    this.digest = options.digest ?? sha256
    this.onStage = options.onStage ?? (() => undefined)
  }

  async inspect(userId: string): Promise<BootstrapDiscoveryResult> {
    this.onStage('detecting')
    const progress = await this.local.getProgress(userId)
    const [anonymousHasData, authenticatedHasData, cloud, bootstrapState] =
      await Promise.all([
        this.local.hasData('local-user'),
        this.local.hasData(userId),
        this.cloud.inspectCloudWorkspace(),
        this.local.getBootstrapState(userId),
      ])
    const localHasData = anonymousHasData || authenticatedHasData
    const local = localHasData ? 'has_data' : 'empty'
    const cloudState = cloud.hasData ? 'has_data' : 'empty'
    const decision =
      bootstrapState === 'bootstrapped'
        ? 'already_bootstrapped'
        : progress
          ? progress.mode === 'connect_local'
            ? 'connect_local_data'
            : 'restore_cloud_data'
          : local === 'empty' && cloudState === 'empty'
            ? 'initialize_authenticated_workspace'
            : local === 'has_data' && cloudState === 'empty'
              ? 'connect_local_data'
              : local === 'empty' && cloudState === 'has_data'
                ? 'restore_cloud_data'
                : 'manual_choice_required'
    this.onStage('decision')
    return {
      local,
      cloud: cloudState,
      syncBootstrapState: bootstrapState,
      decision,
    }
  }

  async initializeEmpty(userId: string): Promise<void> {
    this.onStage('finalizing')
    const cloud = await this.cloud.inspectCloudWorkspace()
    if (cloud.hasData) throw new Error('Cloud workspace is not empty.')
    await this.local.initializeEmptyWorkspace(
      userId,
      this.deviceIdentity.getDeviceId(),
      cloud.highWatermark,
      this.now(),
    )
    this.onStage('complete')
  }

  async connectLocalData(
    userId: string,
    timezone: string,
    safetySink: SafetyBackupSink,
  ): Promise<void> {
    const existing = await this.local.getProgress(userId)
    if (!existing) {
      this.onStage('safety_backup')
      const safety = await this.backups.createBackup(
        'local-user',
        timezone,
        true,
      )
      await safetySink.save(safety.backup, safety.filename)
      this.onStage('preparing')
      await this.local.migrateOwnership(
        'local-user',
        userId,
        this.createId(),
        this.deviceIdentity.getDeviceId(),
        this.now(),
      )
    }
    await this.resume(userId)
  }

  async useCloud(
    userId: string,
    timezone: string,
    safetySink: SafetyBackupSink,
  ): Promise<void> {
    const sourceUserId = (await this.local.hasData('local-user'))
      ? 'local-user'
      : userId
    this.onStage('safety_backup')
    const safety = await this.backups.createBackup(sourceUserId, timezone, true)
    await safetySink.save(safety.backup, safety.filename)
    await this.restoreCloud(userId, 'use_cloud', sourceUserId)
  }

  async restoreCloud(
    userId: string,
    mode: 'restore_cloud' | 'use_cloud' = 'restore_cloud',
    sourceUserId = 'local-user',
  ): Promise<void> {
    const existing = await this.local.getProgress(userId)
    if (!existing) {
      await this.local.beginCloudRestore(
        sourceUserId,
        userId,
        this.createId(),
        this.deviceIdentity.getDeviceId(),
        mode,
        this.now(),
      )
    }
    await this.resume(userId)
  }

  async resume(userId: string): Promise<void> {
    const progress = await this.local.getProgress(userId)
    if (!progress) return
    if (progress.mode === 'connect_local') {
      await this.resumeUpload(userId)
      return
    }
    this.onStage('downloading')
    const snapshot = await this.cloud.downloadBootstrapSnapshot(userId)
    this.onStage('finalizing')
    await this.local.replaceWithCloud(
      progress.sourceUserId,
      userId,
      progress.deviceId,
      snapshot,
      this.now(),
    )
    this.onStage('complete')
  }

  async cancel(userId: string): Promise<void> {
    const progress = await this.local.getProgress(userId)
    if (!progress) return
    if (progress.mode === 'connect_local') {
      await this.local.rollbackOwnership(userId, this.now())
    } else if (progress.stage !== 'finalizing') {
      await this.local.clearProgress(userId)
    }
  }

  private async resumeUpload(userId: string): Promise<void> {
    const progress = await this.local.getProgress(userId)
    if (!progress) return
    if (progress.stage === 'server_committed') {
      if (!progress.serverResult || progress.highWatermark === null) {
        throw new Error('Committed bootstrap acknowledgement is incomplete.')
      }
      this.onStage('finalizing')
      await this.local.finalizeUploadedWorkspace(
        userId,
        progress.deviceId,
        progress.serverResult.entityResults,
        progress.highWatermark,
        this.now(),
      )
      this.onStage('complete')
      return
    }

    const snapshot = validateBootstrapSnapshot(
      await this.local.createSnapshot(userId, this.now()),
      userId,
    )
    const entries = flattenBootstrapSnapshot(snapshot)
    const manifestHash = await this.digest(JSON.stringify(entries))
    const chunks = await this.chunks(progress.bootstrapId, entries)
    await this.local.updateProgress(userId, {
      stage: 'uploading',
      manifestHash,
      totalChunks: chunks.length,
      updatedAt: this.now(),
    })
    this.onStage('uploading')
    const begin = await this.cloud.beginBootstrap({
      bootstrapId: progress.bootstrapId,
      deviceId: progress.deviceId,
      manifestHash,
      totalChunks: chunks.length,
    })
    if (begin.status === 'staging') {
      const refreshed = await this.local.getProgress(userId)
      const start = refreshed?.nextChunkIndex ?? 0
      for (const chunk of chunks.slice(start)) {
        await this.cloud.uploadBootstrapChunk({
          bootstrapId: progress.bootstrapId,
          chunkIndex: chunk.index,
          idempotencyKey: chunk.idempotencyKey,
          payload: chunk.payload,
        })
        await this.local.updateProgress(userId, {
          nextChunkIndex: chunk.index + 1,
          updatedAt: this.now(),
        })
      }
    }
    this.onStage('finalizing')
    const result = await this.cloud.commitBootstrap(progress.bootstrapId)
    await this.recordServerCommit(userId, result)
    await this.resumeUpload(userId)
  }

  private async recordServerCommit(
    userId: string,
    result: BootstrapCommitResult,
  ) {
    await this.local.updateProgress(userId, {
      stage: 'server_committed',
      serverResult: {
        mutationId: result.bootstrapId,
        entityResults: result.entityResults,
      },
      highWatermark: result.highWatermark,
      updatedAt: this.now(),
    })
  }

  private async chunks(
    bootstrapId: string,
    entries: ReturnType<typeof flattenBootstrapSnapshot>,
  ): Promise<BootstrapChunk[]> {
    const chunks: BootstrapChunk[] = []
    for (let offset = 0; offset < entries.length; offset += this.chunkSize) {
      const changes = entries
        .slice(offset, offset + this.chunkSize)
        .map(({ entityType, entityId, entitySnapshot }) => ({
          entityType,
          entityId,
          operation: 'create' as const,
          baseServerRevision: null,
          entitySnapshot,
        }))
      const index = chunks.length
      const hash = await this.digest(
        `${bootstrapId}:${index}:${JSON.stringify(changes)}`,
      )
      chunks.push({
        index,
        idempotencyKey: uuidFromHash(hash),
        payload: { changes },
      })
    }
    return chunks
  }
}
