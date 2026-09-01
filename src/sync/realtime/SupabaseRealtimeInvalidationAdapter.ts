import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  RealtimeInvalidationPort,
  RealtimeSubscriptionObserver,
} from './contracts'

export class SupabaseRealtimeInvalidationAdapter implements RealtimeInvalidationPort {
  constructor(private readonly client: SupabaseClient) {}

  subscribe(
    userId: string,
    observer: RealtimeSubscriptionObserver,
  ): () => void {
    let active = true
    let connectedOnce = false
    let channel: RealtimeChannel | null = this.client.channel(
      `sync-invalidations:${userId}`,
      { config: {} },
    )
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_invalidations',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return
          const row = payload.new as Record<string, unknown>
          const revision = Number(row.server_revision)
          observer.onInvalidation({
            userId,
            reason: 'remote_change',
            revisionHint:
              Number.isSafeInteger(revision) && revision > 0 ? revision : null,
          })
        },
      )
      .subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          const reason = connectedOnce ? 'reconnected' : 'subscribed'
          connectedOnce = true
          observer.onStateChange('connected')
          observer.onInvalidation({ userId, reason, revisionHint: null })
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          observer.onStateChange(connectedOnce ? 'reconnecting' : 'unavailable')
          return
        }
        if (status === 'CLOSED') observer.onStateChange('reconnecting')
      })
    observer.onStateChange('connecting')

    return () => {
      active = false
      observer.onStateChange('idle')
      const current = channel
      channel = null
      if (current) void this.client.removeChannel(current)
    }
  }
}
