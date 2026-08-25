import { addLocalDateDays, instantToLocalDate } from '@/domain/time'
import type { Instant } from '@/domain/shared'
import type { TaskRepository } from '@/repositories/contracts'
import type { MorningReviewData, MorningReviewInput } from './contracts'

export function resolveMorningReviewDate(
  now: Instant,
  timezone: string,
): string {
  return instantToLocalDate(now, timezone)
}

export class MorningReviewQuery {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: MorningReviewInput): Promise<MorningReviewData> {
    const previousDate = addLocalDateDays(input.date, -1)
    const tasks = await this.tasks.find(input.userId, {
      plannedOn: previousDate,
      statuses: ['todo', 'doing'],
    })
    return { ...input, previousDate, tasks }
  }
}
