import { describe, expect, it } from 'vitest'
import { RepositoryVersionConflictError } from '@/repositories/errors'
import { DatabaseRuntimeState, classifyDatabaseError } from './runtimeState'

describe('Database Runtime State', () => {
  it('classifies quota and transaction abort failures without user data', () => {
    const runtime = new DatabaseRuntimeState(7)
    runtime.failure(new DOMException('storage full', 'QuotaExceededError'), {
      storeName: 'memos',
    })
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'read-only',
      errorCategory: 'quota-exceeded',
      canRetry: true,
    })
    expect(runtime.diagnostics()[0]).toEqual(
      expect.objectContaining({
        databaseVersion: 7,
        storeName: 'memos',
        errorCategory: 'quota-exceeded',
      }),
    )
    expect(JSON.stringify(runtime.diagnostics())).not.toContain('storage full')
    expect(
      classifyDatabaseError(new DOMException('aborted', 'AbortError')),
    ).toBe('transaction-abort')
    expect(
      classifyDatabaseError(new RepositoryVersionConflictError('task-1')),
    ).toBe('unknown')
  })

  it('exposes blocked and versionchange recovery states', () => {
    const blocked = new DatabaseRuntimeState(7)
    blocked.blocked()
    expect(blocked.getSnapshot().status).toBe('blocked')

    const changed = new DatabaseRuntimeState(7)
    changed.versionChanged()
    expect(changed.getSnapshot()).toMatchObject({
      status: 'recovery-required',
      errorCategory: 'versionchange',
    })
  })

  it('moves from open failure through retry opening to ready', () => {
    const runtime = new DatabaseRuntimeState(7)
    runtime.failure(new Error('open failed'), { phase: 'open' })
    expect(runtime.getSnapshot().status).toBe('unavailable')
    runtime.opening()
    expect(runtime.getSnapshot().status).toBe('opening')
    runtime.ready()
    expect(runtime.getSnapshot().status).toBe('ready')
  })

  it('requires recovery after a migration failure', () => {
    const runtime = new DatabaseRuntimeState(7)
    runtime.failure(new Error('upgrade callback failed'), {
      phase: 'migration',
    })
    expect(runtime.getSnapshot()).toMatchObject({
      status: 'recovery-required',
      errorCategory: 'migration-failure',
      canRetry: true,
    })
  })
})
