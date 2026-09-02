import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/AuthContext'
import { PreferencesProvider } from '@/features/settings/preferences/PreferencesProvider'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { SyncContext } from './SyncContext'
import { SyncStatusIndicator } from './SyncStatusIndicator'

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('shows a quiet conflict count and safe candidate summaries', async () => {
    const syncNow = vi.fn(async () => undefined)
    const resolveConflict = vi.fn(async () => undefined)
    render(
      <PreferencesProvider>
        <AuthContext.Provider
          value={{
            configured: true,
            status: 'signed_in',
            identity: { kind: 'authenticated', userId, email: null },
            errorCode: null,
            sendMagicLink: vi.fn(),
            signOut: vi.fn(),
            retrySessionRestore: vi.fn(),
          }}
        >
          <SyncContext.Provider
            value={{
              state: {
                status: 'conflict',
                lastSuccessfulSyncAt: '2026-09-01T01:00:00.000Z',
                pendingMutationCount: 1,
                conflictCount: 1,
                safeErrorCode: null,
              },
              conflicts: [
                {
                  id: 'conflict-1',
                  entityType: 'task',
                  entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                  conflictType: 'SameBaseConcurrentEdit',
                  title: 'Plan launch',
                  localCandidate: 'Plan launch locally',
                  remoteCandidate: 'Plan launch remotely',
                  occurredAt: '2026-09-01T01:00:00.000Z',
                  differences: [
                    {
                      field: 'title',
                      localValue: 'Plan launch locally',
                      remoteValue: 'Plan launch remotely',
                    },
                  ],
                  availableActions: ['keep_mine', 'use_remote'],
                  selectionCandidates: [],
                },
              ],
              realtimeState: 'unavailable',
              syncNow,
              resolveConflict,
            }}
          >
            <SyncStatusIndicator />
          </SyncContext.Provider>
        </AuthContext.Provider>
      </PreferencesProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '1 sync conflicts' }))
    expect(screen.getByText(/Both versions are preserved/)).toBeInTheDocument()
    expect(
      screen.getByText(/Live updates are reconnecting/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review conflicts' }))
    expect(await screen.findByText(/Edited on two devices/)).toBeInTheDocument()
    expect(screen.getByText(/Plan launch locally/)).toBeInTheDocument()
    expect(screen.getByText(/Plan launch remotely/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep this device' }))
    expect(resolveConflict).toHaveBeenCalledWith(
      'conflict-1',
      'keep_mine',
      undefined,
    )
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('dialog', { name: 'Resolve changes safely' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(syncNow).toHaveBeenCalledOnce()
  })
})
