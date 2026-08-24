import type { Activity } from '@/domain/entities'
import type {
  ActivityQuery,
  ActivityRepository,
} from '@/repositories/contracts'
import { ActivityAppendConflictError } from '@/repositories/errors'

export class InMemoryActivityRepository implements ActivityRepository {
  private readonly records = new Map<string, Activity>()

  async find(query: ActivityQuery): Promise<Activity[]> {
    const records = [...this.records.values()]
      .filter(
        (activity) =>
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

  async append(activity: Activity): Promise<void> {
    if (this.records.has(activity.id)) {
      throw new ActivityAppendConflictError(activity.id)
    }
    this.records.set(activity.id, structuredClone(activity))
  }
}
