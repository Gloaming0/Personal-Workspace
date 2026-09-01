import { CloudPortError } from '@/cloud/contracts'
import type { RetryPolicy, SyncErrorKind } from './contracts'

const authCodes = new Set([
  'AuthenticationRequired',
  'invalid_jwt',
  'PGRST301',
  '401',
])
const conflictCodes = new Set([
  'PT409',
  'BaseServerRevisionConflict',
  '23505',
  '23P01',
  'ImmutableEntityConflict',
  'DuplicateUniqueInvariant',
])
const permanentCodes = new Set([
  'MutationIdReuse',
  'OwnershipConflict',
  '22023',
  '42501',
  '23514',
  '23503',
])
const retryableCodes = new Set([
  'request_failed',
  'timeout',
  'connection_reset',
  '429',
  '502',
  '503',
  '504',
  '57014',
])

export function classifySyncError(
  error: unknown,
  online = typeof navigator === 'undefined' ? true : navigator.onLine,
): SyncErrorKind {
  if (!online) return 'offline'
  if (!(error instanceof CloudPortError)) return 'unknown'
  if (authCodes.has(error.safeCode)) return 'auth'
  if (conflictCodes.has(error.safeCode)) return 'conflict'
  if (permanentCodes.has(error.safeCode)) return 'permanent'
  if (retryableCodes.has(error.safeCode)) return 'retryable'
  return 'unknown'
}

export function createRetryPolicy(
  random: () => number = Math.random,
): RetryPolicy {
  return {
    maxAttempts: 4,
    delayForAttempt(attempt) {
      const base = Math.min(500 * 2 ** Math.max(0, attempt - 1), 8_000)
      return Math.round(base * (0.75 + random() * 0.5))
    },
  }
}
