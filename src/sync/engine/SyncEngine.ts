import type { CloudSyncPort } from '@/cloud/contracts'
import type { LocalMutationRecord, SyncRepository } from '@/sync/contracts'
import type {
  AuthenticatedSyncIdentity,
  RetryPolicy,
  SyncErrorKind,
  SyncRunLock,
  SyncRunResult,
  SyncState,
} from './contracts'
import { classifySyncError, createRetryPolicy } from './retryPolicy'
import { SyncStatusStore } from './SyncStatusStore'

export interface SyncEngineOptions {
  pageSize?: number
  now?: () => string
  online?: () => boolean
  delay?: (milliseconds: number) => Promise<void>
  retryPolicy?: RetryPolicy
  classifyError?: (error: unknown) => SyncErrorKind
  refreshSession?: () => Promise<boolean>
}

export class SyncEngine {
  private readonly pageSize: number
  private readonly now: () => string
  private readonly online: () => boolean
  private readonly delay: (milliseconds: number) => Promise<void>
  private readonly retryPolicy: RetryPolicy
  private readonly classifyError: (error: unknown) => SyncErrorKind
  private readonly refreshSession: () => Promise<boolean>
  private activeRun: Promise<SyncRunResult> | null = null

  constructor(
    private readonly local: SyncRepository,
    private readonly cloud: CloudSyncPort,
    private readonly lock: SyncRunLock,
    readonly status: SyncStatusStore,
    private readonly deviceId: string,
    options: SyncEngineOptions = {},
  ) {
    this.pageSize = options.pageSize ?? 100
    this.now = options.now ?? (() => new Date().toISOString())
    this.online =
      options.online ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.delay =
      options.delay ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.retryPolicy = options.retryPolicy ?? createRetryPolicy()
    this.classifyError =
      options.classifyError ??
      ((error) => classifySyncError(error, this.online()))
    this.refreshSession = options.refreshSession ?? (async () => false)
  }

  sync(identity: AuthenticatedSyncIdentity | null): Promise<SyncRunResult> {
    if (this.activeRun) return this.activeRun
    this.activeRun = this.lock
      .run(() => this.execute(identity))
      .then(async (locked) => {
        if (locked.acquired) return locked.value
        return this.snapshotWithConflicts(identity?.userId)
      })
      .finally(() => {
        this.activeRun = null
      })
    return this.activeRun
  }

  private async execute(
    identity: AuthenticatedSyncIdentity | null,
  ): Promise<SyncRunResult> {
    if (!identity) {
      return this.finish(null, 'auth_required', 'signed_out')
    }
    const userId = identity.userId
    if (!this.online()) return this.finish(userId, 'offline', 'offline')
    try {
      const [bootstrapState, deviceState] = await Promise.all([
        this.local.getBootstrapState(userId),
        this.local.getDeviceState(userId, this.deviceId),
      ])
      if (bootstrapState !== 'bootstrapped' || !deviceState) {
        return this.finish(userId, 'blocked', 'bootstrap_required')
      }

      this.status.patch({ status: 'syncing', safeErrorCode: null })
      await this.local.recoverInFlight(userId, this.deviceId)
      await this.pullUntilCaughtUp(userId)
      await this.pushPendingMutations(userId)
      await this.pullUntilCaughtUp(userId)
      const counts = await this.local.getQueueCounts(userId)
      const status =
        counts.conflicts > 0
          ? 'conflict'
          : counts.failedPermanent > 0
            ? 'blocked'
            : 'idle'
      const state: SyncState = {
        status,
        lastSuccessfulSyncAt: this.now(),
        pendingMutationCount: counts.pending,
        conflictCount: counts.conflicts,
        safeErrorCode:
          counts.failedPermanent > 0 ? 'permanent_remote_rejection' : null,
      }
      this.status.set(state)
      return {
        state,
        conflicts: await this.local.listConflictViews(userId),
      }
    } catch (error) {
      const kind = this.classifyError(error)
      if (kind === 'offline' || kind === 'retryable') {
        return this.finish(userId, 'offline', 'network_unavailable')
      }
      if (kind === 'auth') {
        return this.finish(userId, 'auth_required', 'session_expired')
      }
      if (kind === 'conflict') {
        return this.finish(userId, 'conflict', 'sync_conflict')
      }
      return this.finish(userId, 'error', 'sync_failed')
    }
  }

  private async pullUntilCaughtUp(userId: string): Promise<void> {
    let cursor = await this.local.getPullCursor(userId, this.deviceId)
    for (;;) {
      const page = await this.readWithRetry(() =>
        this.cloud.pullRemotePage(cursor, this.pageSize),
      )
      if (page.highWatermark < cursor) {
        throw new Error('Remote high watermark moved backwards.')
      }
      if (page.changes.length === 0) {
        if (cursor < page.highWatermark) {
          throw new Error('Remote page omitted revisions before its watermark.')
        }
        return
      }
      const lastRevision = page.changes.at(-1)!.serverRevision
      await this.local.applyRemotePage({
        userId,
        deviceId: this.deviceId,
        fromRevision: cursor,
        toRevision: lastRevision,
        changes: page.changes,
      })
      cursor = lastRevision
      if (cursor >= page.highWatermark) return
    }
  }

  private async pushPendingMutations(userId: string): Promise<void> {
    for (;;) {
      const mutations = await this.local.listPendingMutations(
        userId,
        this.deviceId,
      )
      if (mutations.length === 0) return
      let progressed = false
      for (const mutation of mutations) {
        await this.local.markMutationInFlight(userId, mutation.mutationId)
        try {
          const acknowledgement = await this.submitWithRetry(mutation)
          await this.local.markMutationAcknowledged(
            userId,
            acknowledgement,
            this.now(),
          )
          progressed = true
        } catch (error) {
          let finalError = error
          const kind = this.classifyError(finalError)
          if (kind === 'auth' && (await this.refreshSession())) {
            try {
              const acknowledgement = await this.submitWithRetry(mutation)
              await this.local.markMutationAcknowledged(
                userId,
                acknowledgement,
                this.now(),
              )
              progressed = true
              continue
            } catch (retryError) {
              finalError = retryError
            }
          }
          const finalKind = this.classifyError(finalError)
          if (finalKind === 'conflict') {
            await this.local.markMutationPending(userId, mutation.mutationId)
            await this.pullUntilCaughtUp(userId)
            return
          }
          if (finalKind === 'permanent') {
            await this.local.markMutationFailedPermanent(
              userId,
              mutation.mutationId,
              'permanent_remote_rejection',
            )
            progressed = true
            continue
          }
          await this.local.markMutationPending(userId, mutation.mutationId)
          throw finalError
        }
      }
      if (!progressed) return
    }
  }

  private async submitWithRetry(mutation: LocalMutationRecord) {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      try {
        return await this.cloud.submitMutation(mutation)
      } catch (error) {
        lastError = error
        const kind = this.classifyError(error)
        if (kind !== 'retryable' && kind !== 'offline') throw error
        try {
          const known = await this.cloud.queryMutationResult(
            mutation.mutationId,
          )
          if (known) return known
        } catch {
          // The original idempotent mutation is retried below.
        }
        if (kind === 'offline' || attempt === this.retryPolicy.maxAttempts) {
          throw error
        }
        await this.delay(this.retryPolicy.delayForAttempt(attempt))
      }
    }
    throw lastError
  }

  private async readWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let refreshed = false
    let lastError: unknown
    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        const kind = this.classifyError(error)
        if (kind === 'auth' && !refreshed) {
          refreshed = true
          if (await this.refreshSession()) continue
        }
        if (kind !== 'retryable' || attempt === this.retryPolicy.maxAttempts) {
          throw error
        }
        await this.delay(this.retryPolicy.delayForAttempt(attempt))
      }
    }
    throw lastError
  }

  private async finish(
    userId: string | null,
    status: SyncState['status'],
    safeErrorCode: string,
  ): Promise<SyncRunResult> {
    const counts = userId
      ? await this.local.getQueueCounts(userId).catch(() => ({
          pending: 0,
          conflicts: 0,
          failedPermanent: 0,
        }))
      : { pending: 0, conflicts: 0, failedPermanent: 0 }
    const state: SyncState = {
      ...this.status.getSnapshot(),
      status,
      pendingMutationCount: counts.pending,
      conflictCount: counts.conflicts,
      safeErrorCode,
    }
    this.status.set(state)
    return {
      state,
      conflicts: userId
        ? await this.local.listConflictViews(userId).catch(() => [])
        : [],
    }
  }

  private async snapshotWithConflicts(
    userId: string | undefined,
  ): Promise<SyncRunResult> {
    return {
      state: this.status.getSnapshot(),
      conflicts: userId
        ? await this.local.listConflictViews(userId).catch(() => [])
        : [],
    }
  }
}
