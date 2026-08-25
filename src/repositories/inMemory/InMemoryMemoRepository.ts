import type { Memo } from '@/domain/entities'
import { instantToLocalDate } from '@/domain/time'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  MemoQuery,
  MemoRepository,
  RepositoryWriteOptions,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateMemo,
} from '@/repositories/validation'

export class InMemoryMemoRepository implements MemoRepository {
  private readonly records = new Map<EntityId, Memo>()

  async getById(userId: UserId, id: EntityId): Promise<Memo | null> {
    assertUserId(userId)
    const memo = this.records.get(id)
    if (!memo || memo.userId !== userId) return null
    const validated = validateMemo(memo)
    return validated.deletedAt === null ? structuredClone(validated) : null
  }

  async find(userId: UserId, query: MemoQuery): Promise<Memo[]> {
    assertUserId(userId)
    const records = [...this.records.values()]
      .filter((memo) => memo.userId === userId)
      .map(validateMemo)
      .filter(
        (memo) =>
          memo.deletedAt === null &&
          (query.pinned === undefined || memo.pinned === query.pinned) &&
          (!query.projectId || memo.projectId === query.projectId) &&
          (!query.updatedOn ||
            instantToLocalDate(memo.updatedAt, query.timezone ?? 'UTC') ===
              query.updatedOn),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return records
      .slice(0, query.limit ?? records.length)
      .map((memo) => structuredClone(memo))
  }

  async save(
    userId: UserId,
    memo: Memo,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    validateMemo(memo)
    assertRepositoryOwner(userId, memo)
    const current = this.records.get(memo.id)
    if (current) assertRepositoryOwner(userId, current)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        memo.version !== current.version + 1
      : options.expectedVersion !== undefined || memo.version !== 1
    if (conflict) throw new RepositoryVersionConflictError(memo.id, 'Memo')
    this.records.set(memo.id, structuredClone(memo))
  }
}
