import type { SyncRunLock } from './contracts'

export class BrowserSyncLock implements SyncRunLock {
  private locallyRunning = false

  constructor(private readonly name = 'daily-work-os:incremental-sync') {}

  async run<T>(
    task: () => Promise<T>,
  ): Promise<
    { acquired: true; value: T } | { acquired: false; value?: never }
  > {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      const result = await navigator.locks.request(
        this.name,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => (lock ? task() : null),
      )
      return result === null
        ? { acquired: false }
        : { acquired: true, value: result }
    }
    if (this.locallyRunning) return { acquired: false }
    this.locallyRunning = true
    try {
      return { acquired: true, value: await task() }
    } finally {
      this.locallyRunning = false
    }
  }
}
