import {
  createMemo,
  editMemo,
  setMemoPinned,
  softDeleteMemo,
  type CreateMemoInput,
  type EditMemoInput,
} from '@/domain/memo'
import type { Memo } from '@/domain/entities'
import type { EntityId, Instant, UserId } from '@/domain/shared'
import type { MemoRepository } from '@/repositories/contracts'
import { ActivityService } from '@/features/activity/ActivityService'

export class MemoNotFoundError extends Error {
  constructor(id: EntityId) {
    super(`Memo ${id} was not found.`)
    this.name = 'MemoNotFoundError'
  }
}

interface MemoServiceContext {
  createId: () => EntityId
  now: () => Instant
}

const defaultContext: MemoServiceContext = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export class MemoService {
  constructor(
    private readonly repository: MemoRepository,
    private readonly context: MemoServiceContext = defaultContext,
    private readonly activities?: ActivityService,
  ) {}

  async create(input: CreateMemoInput): Promise<Memo> {
    const memo = createMemo(input, {
      id: this.context.createId(),
      now: this.context.now(),
    })
    await this.repository.save(input.userId, memo)
    await this.record(memo, 'memo_created')
    return memo
  }

  async edit(
    userId: UserId,
    id: EntityId,
    input: EditMemoInput,
  ): Promise<Memo> {
    return this.update(
      userId,
      id,
      (memo) => editMemo(memo, input, this.context.now()),
      'memo_updated',
    )
  }

  async pin(userId: UserId, id: EntityId): Promise<Memo> {
    return this.update(
      userId,
      id,
      (memo) => setMemoPinned(memo, true, this.context.now()),
      'memo_pinned',
    )
  }

  async unpin(userId: UserId, id: EntityId): Promise<Memo> {
    return this.update(
      userId,
      id,
      (memo) => setMemoPinned(memo, false, this.context.now()),
      'memo_unpinned',
    )
  }

  async delete(userId: UserId, id: EntityId): Promise<Memo> {
    return this.update(userId, id, (memo) =>
      softDeleteMemo(memo, this.context.now()),
    )
  }

  private async update(
    userId: UserId,
    id: EntityId,
    command: (memo: Memo) => Memo,
    eventType?: 'memo_updated' | 'memo_pinned' | 'memo_unpinned',
  ): Promise<Memo> {
    const current = await this.repository.getById(userId, id)
    if (!current) throw new MemoNotFoundError(id)
    const next = command(current)
    await this.repository.save(userId, next, {
      expectedVersion: current.version,
    })
    if (eventType) await this.record(next, eventType)
    return next
  }

  private async record(
    memo: Memo,
    eventType:
      'memo_created' | 'memo_updated' | 'memo_pinned' | 'memo_unpinned',
  ): Promise<void> {
    await this.activities?.record({
      userId: memo.userId,
      eventType,
      entityType: 'memo',
      entityId: memo.id,
      title: memo.content,
      projectId: memo.projectId,
    })
  }
}
