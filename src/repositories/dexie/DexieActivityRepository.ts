import type { Activity } from '@/domain/entities'
import type {
  ActivityQuery,
  ActivityRepository,
} from '@/repositories/contracts'
import {
  ActivityAppendConflictError,
  ActivityPersistenceError,
} from '@/repositories/errors'
import type { DailyWorkDatabase } from '@/database/DailyWorkDatabase'

const cloneActivity = (activity: Activity) => structuredClone(activity)

export class DexieActivityRepository implements ActivityRepository {
  constructor(private readonly database: DailyWorkDatabase) {}

  async find(query: ActivityQuery): Promise<Activity[]> {
    try {
      const activities = (await this.database.activities.toArray())
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
      return activities
        .slice(0, query.limit ?? activities.length)
        .map(cloneActivity)
    } catch (error) {
      throw new ActivityPersistenceError('Activities could not be queried.', {
        cause: error,
      })
    }
  }

  async append(activity: Activity): Promise<void> {
    try {
      await this.database.activities.add(cloneActivity(activity))
    } catch (error) {
      if ((error as { name?: string }).name === 'ConstraintError') {
        throw new ActivityAppendConflictError(activity.id)
      }
      throw new ActivityPersistenceError('Activity could not be appended.', {
        cause: error,
      })
    }
  }
}
