export type LocalChangeStore =
  | 'tasks'
  | 'confirmations'
  | 'memos'
  | 'routines'
  | 'routine_logs'
  | 'activities'
  | 'daily_logs'

export interface LocalChange {
  store: LocalChangeStore
  entityId: string
  entityVersion: number
  revision: string
}

type LocalChangeInput = Omit<LocalChange, 'revision'>
type Listener = (change: LocalChange) => void

interface LocalChangeEnvelope extends LocalChange {
  sourceId: string
}

interface BroadcastChannelLike {
  postMessage(message: LocalChangeEnvelope): void
  close(): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<LocalChangeEnvelope>) => void,
  ): void
}

export interface LocalChangeCoordinatorOptions {
  sourceId?: string
  createRevision?: () => string
  channelFactory?: (name: string) => BroadcastChannelLike | null
}

const defaultChannelFactory = (name: string): BroadcastChannelLike | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)

export class LocalChangeCoordinator {
  private readonly sourceId: string
  private readonly createRevision: () => string
  private readonly channel: BroadcastChannelLike | null
  private readonly listeners = new Set<Listener>()
  private readonly seenRevisions = new Set<string>()

  constructor(
    databaseName: string,
    options: LocalChangeCoordinatorOptions = {},
  ) {
    this.sourceId = options.sourceId ?? crypto.randomUUID()
    this.createRevision = options.createRevision ?? (() => crypto.randomUUID())
    this.channel = (options.channelFactory ?? defaultChannelFactory)(
      `${databaseName}:local-changes`,
    )
    this.channel?.addEventListener('message', (event) => {
      const change = event.data
      if (
        !change ||
        change.sourceId === this.sourceId ||
        this.seenRevisions.has(change.revision)
      )
        return
      this.seenRevisions.add(change.revision)
      this.emit({
        store: change.store,
        entityId: change.entityId,
        entityVersion: change.entityVersion,
        revision: change.revision,
      })
    })
  }

  publish(input: LocalChangeInput): LocalChange {
    const change: LocalChange = { ...input, revision: this.createRevision() }
    this.seenRevisions.add(change.revision)
    this.channel?.postMessage({ ...change, sourceId: this.sourceId })
    return change
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.channel?.close()
    this.listeners.clear()
  }

  private emit(change: LocalChange): void {
    this.listeners.forEach((listener) => listener(change))
  }
}
