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
import {
  executeAtomic,
  type UnitOfWork,
  type UnitOfWorkTransaction,
} from '@/unitOfWork/contracts'

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
    private readonly unitOfWork: UnitOfWork,
    private readonly context: MemoServiceContext = defaultContext,
    private readonly activities?: ActivityService,
  ) {}

  async create(input: CreateMemoInput): Promise<Memo> {
    return executeAtomic(
      this.unitOfWork,
      this.stores(true),
      async (transaction) => {
        const repository = transaction.repository('memos')
        const memo = createMemo(input, {
          id: this.context.createId(),
          now: this.context.now(),
        })
        await repository.save(input.userId, memo)
        await this.record(memo, 'memo_created', transaction)
        return memo
      },
    )
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
    return executeAtomic(
      this.unitOfWork,
      this.stores(Boolean(eventType)),
      async (transaction) => {
        const repository = transaction.repository('memos')
        const current = await repository.getById(userId, id)
        if (!current) throw new MemoNotFoundError(id)
        const next = command(current)
        await repository.save(userId, next, {
          expectedVersion: current.version,
        })
        if (eventType) await this.record(next, eventType, transaction)
        return next
      },
    )
  }

  private stores(includeActivity: boolean) {
    return includeActivity && this.activities
      ? (['memos', 'activities'] as const)
      : (['memos'] as const)
  }

  private async record(
    memo: Memo,
    eventType:
      'memo_created' | 'memo_updated' | 'memo_pinned' | 'memo_unpinned',
    transaction: UnitOfWorkTransaction,
  ): Promise<void> {
    if (this.activities)
      await this.activities.record(
        {
          userId: memo.userId,
          eventType,
          entityType: 'memo',
          entityId: memo.id,
          title: memo.content,
          projectId: memo.projectId,
        },
        transaction.repository('activities'),
      )
  }
}
