import type { EntityId } from '@/domain/shared'
import type { TaskService } from '@/features/tasks/TaskService'
import type {
  MorningReviewAction,
  MorningReviewData,
  MorningReviewInput,
  MorningReviewSeenStore,
} from './contracts'
import type { MorningReviewQuery } from './MorningReviewQuery'

export class MorningReviewService {
  constructor(
    private readonly query: MorningReviewQuery,
    private readonly tasks: TaskService,
    private readonly seen: MorningReviewSeenStore,
  ) {}

  async load(input: MorningReviewInput): Promise<MorningReviewData | null> {
    if (await this.seen.hasSeen(input.userId, input.date)) return null
    const review = await this.query.execute(input)
    if (review.tasks.length === 0) {
      await this.seen.markSeen(input.userId, input.date)
      return null
    }
    return review
  }

  async apply(
    input: MorningReviewInput,
    taskId: EntityId,
    action: MorningReviewAction,
  ): Promise<MorningReviewData | null> {
    switch (action) {
      case 'today':
        await this.tasks.moveToDate(taskId, input.date)
        break
      case 'later':
        await this.tasks.moveToLater(taskId)
        break
      case 'done':
        await this.tasks.complete(taskId)
        break
      case 'delete':
        await this.tasks.delete(taskId)
        break
    }
    const remaining = await this.query.execute(input)
    if (remaining.tasks.length > 0) return remaining
    await this.seen.markSeen(input.userId, input.date)
    return null
  }

  async moveAll(input: MorningReviewInput): Promise<void> {
    const review = await this.query.execute(input)
    for (const task of review.tasks) {
      await this.tasks.moveToDate(task.id, input.date)
    }
    await this.seen.markSeen(input.userId, input.date)
  }

  skip(input: MorningReviewInput): Promise<void> {
    return this.seen.markSeen(input.userId, input.date)
  }
}
