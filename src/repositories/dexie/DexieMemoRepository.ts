import type { Memo } from '@/domain/entities'
import { instantToLocalDate } from '@/domain/time'
import type { EntityId } from '@/domain/shared'
import type {
  MemoQuery,
  MemoRepository,
  RepositoryWriteOptions,
} from '@/repositories/contracts'
import {
  MemoPersistenceError,
  RepositoryVersionConflictError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

const cloneMemo = (memo: Memo) => structuredClone(memo)

function matches(memo: Memo, query: MemoQuery): boolean {
  return (
    memo.deletedAt === null &&
    (query.pinned === undefined || memo.pinned === query.pinned) &&
    (!query.projectId || memo.projectId === query.projectId) &&
    (!query.updatedOn ||
      instantToLocalDate(memo.updatedAt, query.timezone ?? 'UTC') ===
        query.updatedOn)
  )
}

export class DexieMemoRepository implements MemoRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async getById(id: EntityId): Promise<Memo | null> {
    try {
      const memo = await this.database.memos.get(id)
      return memo && memo.deletedAt === null ? cloneMemo(memo) : null
    } catch (error) {
      throw new MemoPersistenceError(`Memo ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(query: MemoQuery): Promise<Memo[]> {
    try {
      const memos = (await this.database.memos.toArray())
        .filter((memo) => matches(memo, query))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      return memos.slice(0, query.limit ?? memos.length).map(cloneMemo)
    } catch (error) {
      throw new MemoPersistenceError('Memos could not be queried.', {
        cause: error,
      })
    }
  }

  async save(memo: Memo, options: RepositoryWriteOptions = {}): Promise<void> {
    try {
      await this.database.transaction('rw', this.database.memos, async () => {
        const current = await this.database.memos.get(memo.id)
        const conflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            memo.version !== current.version + 1
          : options.expectedVersion !== undefined || memo.version !== 1
        if (conflict) throw new RepositoryVersionConflictError(memo.id, 'Memo')
        await this.database.memos.put(cloneMemo(memo))
      })
    } catch (error) {
      if (error instanceof RepositoryVersionConflictError) throw error
      throw new MemoPersistenceError(`Memo ${memo.id} could not be saved.`, {
        cause: error,
      })
    }
  }
}
