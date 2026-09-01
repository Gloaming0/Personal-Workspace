export type RealtimeConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable'

export type RealtimeInvalidationReason =
  'remote_change' | 'subscribed' | 'reconnected'

export interface RealtimeInvalidation {
  userId: string
  reason: RealtimeInvalidationReason
  revisionHint: number | null
}

export interface RealtimeSubscriptionObserver {
  onInvalidation(invalidation: RealtimeInvalidation): void
  onStateChange(state: RealtimeConnectionState): void
}

/**
 * Realtime is an invalidation transport only. Implementations must never expose
 * a business entity or a sync_changes payload to feature/UI code.
 */
export interface RealtimeInvalidationPort {
  subscribe(userId: string, observer: RealtimeSubscriptionObserver): () => void
}
