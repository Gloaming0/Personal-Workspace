import { describe, expect, it, vi } from 'vitest'
import type { SyncRepository } from '@/sync/contracts'
import type { SyncEngine } from '@/sync/engine/SyncEngine'
import type {
  RealtimeInvalidationPort,
  RealtimeSubscriptionObserver,
} from './contracts'
import { RealtimeInvalidationCoordinator } from './RealtimeInvalidationCoordinator'

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class FakeRealtime implements RealtimeInvalidationPort {
  observer: RealtimeSubscriptionObserver | null = null
  userId: string | null = null
  unsubscribeCount = 0

  subscribe(userId: string, observer: RealtimeSubscriptionObserver) {
    this.userId = userId
    this.observer = observer
    return () => {
      this.unsubscribeCount += 1
      this.observer = null
      this.userId = null
    }
  }

  invalidate() {
    this.observer?.onInvalidation({
      userId: this.userId!,
      reason: 'remote_change',
      revisionHint: 8,
    })
  }
}

describe('RealtimeInvalidationCoordinator', () => {
  it('subscribes only after bootstrap and closes on sign-out or user switch', async () => {
    const realtime = new FakeRealtime()
    let state = 'requires_bootstrap'
    const local = {
      getBootstrapState: vi.fn(async () => state),
    } as unknown as SyncRepository
    const engine = { sync: vi.fn() } as unknown as SyncEngine
    const coordinator = new RealtimeInvalidationCoordinator(
      realtime,
      local,
      engine,
    )

    await expect(coordinator.start(USER_A)).resolves.toBe(false)
    expect(realtime.userId).toBeNull()
    state = 'bootstrapped'
    await expect(coordinator.start(USER_A)).resolves.toBe(true)
    expect(realtime.userId).toBe(USER_A)
    await coordinator.start(USER_B)
    expect(realtime.userId).toBe(USER_B)
    expect(realtime.unsubscribeCount).toBe(1)
    coordinator.stop()
    expect(realtime.userId).toBeNull()
  })

  it('coalesces duplicate, self, and reconnect invalidations into one cursor sync', async () => {
    const realtime = new FakeRealtime()
    const local = {
      getBootstrapState: vi.fn(async () => 'bootstrapped'),
    } as unknown as SyncRepository
    const sync = vi.fn(async () => ({ state: {}, conflicts: [] }))
    let scheduled: (() => void) | null = null
    const coordinator = new RealtimeInvalidationCoordinator(
      realtime,
      local,
      { sync } as unknown as SyncEngine,
      {
        debounceMs: 50,
        setTimer: (task) => {
          scheduled = task
          return 1 as unknown as ReturnType<typeof setTimeout>
        },
        clearTimer: () => {
          scheduled = null
        },
      },
    )
    await coordinator.start(USER_A)
    realtime.invalidate()
    realtime.invalidate()
    realtime.observer?.onInvalidation({
      userId: USER_A,
      reason: 'reconnected',
      revisionHint: null,
    })
    await (scheduled as (() => void) | null)?.()
    await Promise.resolve()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith({ kind: 'authenticated', userId: USER_A })
  })
})
