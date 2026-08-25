import { describe, expect, it, vi } from 'vitest'
import {
  LocalChangeCoordinator,
  type LocalChange,
} from './LocalChangeCoordinator'

interface Envelope extends LocalChange {
  sourceId: string
}

class ChannelHub {
  readonly listeners = new Set<(event: MessageEvent<Envelope>) => void>()
  readonly posted: Envelope[] = []

  create() {
    return {
      postMessage: (message: Envelope) => {
        this.posted.push(structuredClone(message))
        this.listeners.forEach((listener) =>
          listener({
            data: structuredClone(message),
          } as MessageEvent<Envelope>),
        )
      },
      close: vi.fn(),
      addEventListener: (
        _type: 'message',
        listener: (event: MessageEvent<Envelope>) => void,
      ) => this.listeners.add(listener),
    }
  }
}

describe('LocalChangeCoordinator', () => {
  it('notifies another tab once without echoing or broadcasting user content', () => {
    const hub = new ChannelHub()
    const first = new LocalChangeCoordinator('workspace', {
      sourceId: 'tab-a',
      createRevision: () => 'revision-1',
      channelFactory: () => hub.create(),
    })
    const second = new LocalChangeCoordinator('workspace', {
      sourceId: 'tab-b',
      channelFactory: () => hub.create(),
    })
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    first.subscribe(firstListener)
    second.subscribe(secondListener)

    first.publish({ store: 'tasks', entityId: 'task-1', entityVersion: 2 })

    expect(firstListener).not.toHaveBeenCalled()
    expect(secondListener).toHaveBeenCalledOnce()
    expect(secondListener).toHaveBeenCalledWith({
      store: 'tasks',
      entityId: 'task-1',
      entityVersion: 2,
      revision: 'revision-1',
    })
    expect(hub.posted).toEqual([
      {
        store: 'tasks',
        entityId: 'task-1',
        entityVersion: 2,
        revision: 'revision-1',
        sourceId: 'tab-a',
      },
    ])
    expect(JSON.stringify(hub.posted)).not.toContain('title')
  })
})
