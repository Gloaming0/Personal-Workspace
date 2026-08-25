import type { Memo } from '@/domain/entities'
import { instantToLocalDate } from '@/domain/time'
import type { EntityId, UserId } from '@/domain/shared'
import type {
  MemoQuery,
  MemoRepository,
  RepositoryWriteOptions,
} from '@/repositories/contracts'
import {
  MemoPersistenceError,
  InvalidPersistedEntityError,
  RepositoryOwnershipError,
  RepositoryVersionConflictError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  assertRepositoryOwner,
  assertUserId,
  validateMemo,
} from '@/repositories/validation'
import { executeDexieWrite } from './executeDexieWrite'
import { validatePersistedRows } from './validatePersistedRows'
import {
  toPersistedChange,
  type PersistedChangeListener,
} from './changeNotification'

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
  constructor(
    private readonly database: DailyWorkDatabase,
    private readonly table = database.memos,
    private readonly transactionBound = false,
    private readonly onChange: PersistedChangeListener = (change) =>
      database.changes.publish(change),
  ) {}

  async getById(userId: UserId, id: EntityId): Promise<Memo | null> {
    try {
      assertUserId(userId)
      const memo = await this.table.get(id)
      if (!memo || memo.userId !== userId) return null
      const validated = validateMemo(memo)
      return validated.deletedAt === null ? cloneMemo(validated) : null
    } catch (error) {
      throw new MemoPersistenceError(`Memo ${id} could not be read.`, {
        cause: error,
      })
    }
  }

  async find(userId: UserId, query: MemoQuery): Promise<Memo[]> {
    try {
      assertUserId(userId)
      const memos = validatePersistedRows(
        this.database,
        'memos',
        (await this.table.toArray()).filter((memo) => memo.userId === userId),
        validateMemo,
      )
        .filter((memo) => matches(memo, query))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      return memos.slice(0, query.limit ?? memos.length).map(cloneMemo)
    } catch (error) {
      throw new MemoPersistenceError('Memos could not be queried.', {
        cause: error,
      })
    }
  }

  async save(
    userId: UserId,
    memo: Memo,
    options: RepositoryWriteOptions = {},
  ): Promise<void> {
    try {
      validateMemo(memo)
      assertRepositoryOwner(userId, memo)
      const write = async () => {
        const current = await this.table.get(memo.id)
        if (current) assertRepositoryOwner(userId, current)
        const conflict = current
          ? (options.expectedVersion !== undefined &&
              current.version !== options.expectedVersion) ||
            memo.version !== current.version + 1
          : options.expectedVersion !== undefined || memo.version !== 1
        if (conflict) throw new RepositoryVersionConflictError(memo.id, 'Memo')
        await this.table.put(cloneMemo(memo))
      }
      await (this.transactionBound
        ? write()
        : executeDexieWrite(this.database, this.table, write))
      this.onChange(toPersistedChange('memos', memo))
    } catch (error) {
      if (
        error instanceof RepositoryVersionConflictError ||
        error instanceof RepositoryOwnershipError ||
        error instanceof InvalidPersistedEntityError
      )
        throw error
      throw new MemoPersistenceError(`Memo ${memo.id} could not be saved.`, {
        cause: error,
      })
    }
  }
}
