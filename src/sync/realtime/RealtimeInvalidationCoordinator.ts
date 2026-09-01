import type { SyncRepository } from '@/sync/contracts'
import type { SyncEngine } from '@/sync/engine/SyncEngine'
import type { SyncRunResult } from '@/sync/engine/contracts'
import type {
  RealtimeConnectionState,
  RealtimeInvalidationPort,
} from './contracts'

export interface RealtimeCoordinatorOptions {
  debounceMs?: number
  setTimer?: (task: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
  onStateChange?: (state: RealtimeConnectionState) => void
}

/** Owns auth/bootstrap-scoped subscription lifecycle and coalesces wake-ups. */
export class RealtimeInvalidationCoordinator {
  private unsubscribe: (() => void) | null = null
  private userId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private readonly resultListeners = new Set<(result: SyncRunResult) => void>()
  private readonly debounceMs: number
  private readonly setTimer: NonNullable<RealtimeCoordinatorOptions['setTimer']>
  private readonly clearTimer: NonNullable<
    RealtimeCoordinatorOptions['clearTimer']
  >
  private readonly onStateChange: NonNullable<
    RealtimeCoordinatorOptions['onStateChange']
  >

  constructor(
    private readonly realtime: RealtimeInvalidationPort,
    private readonly local: SyncRepository,
    private readonly engine: SyncEngine,
    options: RealtimeCoordinatorOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 180
    this.setTimer =
      options.setTimer ?? ((task, delay) => setTimeout(task, delay))
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer))
    this.onStateChange = options.onStateChange ?? (() => undefined)
  }

  async start(userId: string): Promise<boolean> {
    const generation = ++this.generation
    if (this.userId !== userId) this.stopSubscription()
    if ((await this.local.getBootstrapState(userId)) !== 'bootstrapped') {
      if (generation === this.generation) this.stopSubscription()
      return false
    }
    if (generation !== this.generation) return false
    if (this.unsubscribe && this.userId === userId) return true
    this.stopSubscription()
    this.userId = userId
    this.unsubscribe = this.realtime.subscribe(userId, {
      onInvalidation: (event) => {
        if (event.userId === this.userId) this.schedule(userId)
      },
      onStateChange: (state) => this.onStateChange(state),
    })
    return true
  }

  subscribeResults(listener: (result: SyncRunResult) => void): () => void {
    this.resultListeners.add(listener)
    return () => this.resultListeners.delete(listener)
  }

  stop(): void {
    this.generation += 1
    this.stopSubscription()
  }

  private schedule(userId: string): void {
    if (this.timer) this.clearTimer(this.timer)
    this.timer = this.setTimer(() => {
      this.timer = null
      if (this.userId !== userId) return
      void this.engine
        .sync({ kind: 'authenticated', userId })
        .then((result) =>
          this.resultListeners.forEach((listener) => listener(result)),
        )
    }, this.debounceMs)
  }

  private stopSubscription(): void {
    if (this.timer) this.clearTimer(this.timer)
    this.timer = null
    this.unsubscribe?.()
    this.unsubscribe = null
    this.userId = null
    this.onStateChange('idle')
  }
}
