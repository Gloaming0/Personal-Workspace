import type { SyncConflictView } from '@/sync/contracts'

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'auth_required'
  | 'blocked'
  | 'conflict'
  | 'error'

export interface SyncState {
  status: SyncStatus
  lastSuccessfulSyncAt: string | null
  pendingMutationCount: number
  conflictCount: number
  safeErrorCode: string | null
}

export interface AuthenticatedSyncIdentity {
  kind: 'authenticated'
  userId: string
}

export interface SyncRunResult {
  state: SyncState
  conflicts: SyncConflictView[]
}

export interface SyncRunLock {
  run<T>(
    task: () => Promise<T>,
  ): Promise<{ acquired: true; value: T } | { acquired: false; value?: never }>
}

export type SyncErrorKind =
  'retryable' | 'offline' | 'auth' | 'conflict' | 'permanent' | 'unknown'

export interface RetryPolicy {
  maxAttempts: number
  delayForAttempt(attempt: number): number
}
