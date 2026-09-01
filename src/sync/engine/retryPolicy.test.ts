import { describe, expect, it } from 'vitest'
import { CloudPortError } from '@/cloud/contracts'
import { classifySyncError, createRetryPolicy } from './retryPolicy'

describe('sync retry policy', () => {
  it('separates retryable, auth, conflict and permanent failures', () => {
    expect(
      classifySyncError(new CloudPortError('submit', 'request_failed'), true),
    ).toBe('retryable')
    expect(
      classifySyncError(
        new CloudPortError('submit', 'AuthenticationRequired'),
        true,
      ),
    ).toBe('auth')
    expect(classifySyncError(new CloudPortError('submit', 'PT409'), true)).toBe(
      'conflict',
    )
    expect(
      classifySyncError(new CloudPortError('submit', 'MutationIdReuse'), true),
    ).toBe('permanent')
    expect(classifySyncError(new Error('private detail'), false)).toBe(
      'offline',
    )
  })

  it('uses bounded exponential backoff with jitter', () => {
    const policy = createRetryPolicy(() => 0.5)
    expect([1, 2, 3, 4, 5].map(policy.delayForAttempt)).toEqual([
      500, 1000, 2000, 4000, 8000,
    ])
  })
})
