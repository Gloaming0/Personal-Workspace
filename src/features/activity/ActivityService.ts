import { createActivity, type RecordActivityInput } from '@/domain/activity'
import type { Activity } from '@/domain/entities'
import type { EntityId, Instant } from '@/domain/shared'
import type { ActivityRepository } from '@/repositories/contracts'

interface ActivityServiceContext {
  createId: () => EntityId
  now: () => Instant
}

const defaultContext: ActivityServiceContext = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export class ActivityService {
  constructor(
    private readonly activities: ActivityRepository,
    private readonly context: ActivityServiceContext = defaultContext,
  ) {}

  async record(
    input: RecordActivityInput,
    repository: ActivityRepository = this.activities,
  ): Promise<Activity> {
    const activity = createActivity(input, {
      id: this.context.createId(),
      now: this.context.now(),
    })
    await repository.append(input.userId, activity)
    return activity
  }
}
