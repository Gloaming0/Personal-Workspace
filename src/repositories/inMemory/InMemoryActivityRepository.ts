import type { Activity } from '@/domain/entities'
import type { UserId } from '@/domain/shared'
import type {
  ActivityQuery,
  ActivityRepository,
} from '@/repositories/contracts'
import { ActivityAppendConflictError } from '@/repositories/errors'
import {
  assertRepositoryOwner,
  assertUserId,
  validateActivity,
} from '@/repositories/validation'
import {
  createMapSnapshot,
  restoreMapSnapshot,
  type InMemoryTransactionalStore,
} from '@/unitOfWork/inMemory/transactionalStore'

export class InMemoryActivityRepository
  implements ActivityRepository, InMemoryTransactionalStore
{
  private readonly records = new Map<string, Activity>()

  createTransactionSnapshot(): unknown {
    return createMapSnapshot(this.records)
  }

  restoreTransactionSnapshot(snapshot: unknown): void {
    restoreMapSnapshot(this.records, snapshot)
  }

  async find(userId: UserId, query: ActivityQuery): Promise<Activity[]> {
    assertUserId(userId)
    const records = [...this.records.values()]
      .filter((activity) => activity.userId === userId)
      .map(validateActivity)
      .filter(
        (activity) =>
          activity.deletedAt === null &&
          (!query.eventTypes ||
            query.eventTypes.includes(activity.eventType)) &&
          (!query.entityType || activity.entityType === query.entityType) &&
          (!query.entityId || activity.entityId === query.entityId),
      )
      .sort((left, right) =>
        right.occurredAt === left.occurredAt
          ? right.id.localeCompare(left.id)
          : right.occurredAt.localeCompare(left.occurredAt),
      )
    return records
      .slice(0, query.limit ?? records.length)
      .map((activity) => structuredClone(activity))
  }

  async append(userId: UserId, activity: Activity): Promise<void> {
    validateActivity(activity)
    assertRepositoryOwner(userId, activity)
    if (this.records.has(activity.id)) {
      throw new ActivityAppendConflictError(activity.id)
    }
    this.records.set(activity.id, structuredClone(activity))
  }
}
