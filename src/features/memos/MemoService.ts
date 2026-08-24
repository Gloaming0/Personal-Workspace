import {
  createMemo,
  editMemo,
  setMemoPinned,
  softDeleteMemo,
  type CreateMemoInput,
  type EditMemoInput,
} from '@/domain/memo'
import type { Memo } from '@/domain/entities'
import type { EntityId, Instant } from '@/domain/shared'
import type { MemoRepository } from '@/repositories/contracts'

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
  ) {}

  async create(input: CreateMemoInput): Promise<Memo> {
    const memo = createMemo(input, {
      id: this.context.createId(),
      now: this.context.now(),
    })
    await this.repository.save(memo)
    return memo
  }

  async edit(id: EntityId, input: EditMemoInput): Promise<Memo> {
    return this.update(id, (memo) => editMemo(memo, input, this.context.now()))
  }

  async pin(id: EntityId): Promise<Memo> {
    return this.update(id, (memo) =>
      setMemoPinned(memo, true, this.context.now()),
    )
  }

  async unpin(id: EntityId): Promise<Memo> {
    return this.update(id, (memo) =>
      setMemoPinned(memo, false, this.context.now()),
    )
  }

  async delete(id: EntityId): Promise<Memo> {
    return this.update(id, (memo) => softDeleteMemo(memo, this.context.now()))
  }

  private async update(
    id: EntityId,
    command: (memo: Memo) => Memo,
  ): Promise<Memo> {
    const current = await this.repository.getById(id)
    if (!current) throw new MemoNotFoundError(id)
    const next = command(current)
    await this.repository.save(next, { expectedVersion: current.version })
    return next
  }
}
