import type { SyncState } from './contracts'

type Listener = () => void

const initialState: SyncState = {
  status: 'idle',
  lastSuccessfulSyncAt: null,
  pendingMutationCount: 0,
  conflictCount: 0,
  safeErrorCode: null,
}

interface StateEnvelope {
  sourceId: string
  state: SyncState
}

export class SyncStatusStore {
  private state: SyncState
  private readonly listeners = new Set<Listener>()
  private readonly sourceId = crypto.randomUUID()
  private readonly channel: BroadcastChannel | null

  constructor(
    channelName = 'daily-work-os:sync-state',
    initial: SyncState = initialState,
  ) {
    this.state = structuredClone(initial)
    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(channelName)
    this.channel?.addEventListener('message', (event: MessageEvent) => {
      const envelope = event.data as StateEnvelope
      if (!envelope?.state || envelope.sourceId === this.sourceId) return
      this.state = structuredClone(envelope.state)
      this.emit()
    })
  }

  getSnapshot = (): SyncState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(next: SyncState): void {
    this.state = structuredClone(next)
    this.emit()
    this.channel?.postMessage({ sourceId: this.sourceId, state: next })
  }

  patch(update: Partial<SyncState>): void {
    this.set({ ...this.state, ...update })
  }

  close(): void {
    this.channel?.close()
    this.listeners.clear()
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
