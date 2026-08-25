import type { LocalDate, UserId } from '@/domain/shared'
import type { MorningReviewSeenStore } from './contracts'

export const morningReviewSeenStorageKey = 'daily-work-os:morning-review-seen'

export class LocalMorningReviewSeenStore implements MorningReviewSeenStore {
  private readonly memory = new Map<UserId, LocalDate>()

  async hasSeen(userId: UserId, date: LocalDate): Promise<boolean> {
    return this.memory.get(userId) === date || this.read()[userId] === date
  }

  async markSeen(userId: UserId, date: LocalDate): Promise<void> {
    this.memory.set(userId, date)
    try {
      localStorage.setItem(
        morningReviewSeenStorageKey,
        JSON.stringify({ ...this.read(), [userId]: date }),
      )
    } catch {
      // The in-session marker still keeps Morning Review non-blocking when
      // browser storage is unavailable.
    }
  }

  private read(): Record<UserId, LocalDate> {
    try {
      const value = JSON.parse(
        localStorage.getItem(morningReviewSeenStorageKey) ?? '{}',
      )
      if (!value || typeof value !== 'object') return {}
      const entries = Object.entries(value as Record<string, unknown>).flatMap(
        ([userId, date]): [string, string][] =>
          userId.length > 0 && typeof date === 'string' && date.length > 0
            ? [[userId, date]]
            : [],
      )
      return Object.fromEntries(entries)
    } catch {
      return {}
    }
  }
}
