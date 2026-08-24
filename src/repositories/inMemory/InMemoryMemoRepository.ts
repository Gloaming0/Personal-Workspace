import type { Memo } from '@/domain/entities'
import { instantToLocalDate } from '@/domain/time'
import type { EntityId } from '@/domain/shared'
import type {
  MemoQuery,
  MemoRepository,
  RepositoryWriteOptions,
} from '@/repositories/contracts'
import { RepositoryVersionConflictError } from '@/repositories/errors'

export class InMemoryMemoRepository implements MemoRepository {
  private readonly records = new Map<EntityId, Memo>()

  async getById(id: EntityId): Promise<Memo | null> {
    const memo = this.records.get(id)
    return memo && memo.deletedAt === null ? structuredClone(memo) : null
  }

  async find(query: MemoQuery): Promise<Memo[]> {
    const records = [...this.records.values()]
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

  async save(memo: Memo, options: RepositoryWriteOptions = {}): Promise<void> {
    const current = this.records.get(memo.id)
    const conflict = current
      ? (options.expectedVersion !== undefined &&
          current.version !== options.expectedVersion) ||
        memo.version !== current.version + 1
      : options.expectedVersion !== undefined || memo.version !== 1
    if (conflict) throw new RepositoryVersionConflictError(memo.id, 'Memo')
    this.records.set(memo.id, structuredClone(memo))
  }
}
