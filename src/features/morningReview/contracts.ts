import type { Task } from '@/domain/entities'
import type { LocalDate, UserId } from '@/domain/shared'

export type MorningReviewAction = 'today' | 'later' | 'done' | 'delete'

export interface MorningReviewInput {
  userId: UserId
  date: LocalDate
  timezone: string
}

export interface MorningReviewData extends MorningReviewInput {
  previousDate: LocalDate
  tasks: Task[]
}

export interface MorningReviewSeenStore {
  hasSeen(userId: UserId, date: LocalDate): Promise<boolean>
  markSeen(userId: UserId, date: LocalDate): Promise<void>
}
