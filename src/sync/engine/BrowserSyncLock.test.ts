import { describe, expect, it } from 'vitest'
import { BrowserSyncLock } from './BrowserSyncLock'

describe('BrowserSyncLock fallback', () => {
  it('allows only one local network run at a time', async () => {
    const original = navigator.locks
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: undefined,
    })
    const lock = new BrowserSyncLock('test-sync-lock')
    let release!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = lock.run(async () => {
      await waiting
      return 'first'
    })
    const second = await lock.run(async () => 'second')
    release()

    expect(second).toEqual({ acquired: false })
    await expect(first).resolves.toEqual({ acquired: true, value: 'first' })
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: original,
    })
  })
})
