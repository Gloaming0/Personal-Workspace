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
                },
              ],
              syncNow,
            }}
          >
            <SyncStatusIndicator />
          </SyncContext.Provider>
        </AuthContext.Provider>
      </PreferencesProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '1 sync conflicts' }))
    expect(screen.getByText(/Edited on two devices/)).toBeInTheDocument()
    expect(screen.getByText(/Plan launch locally/)).toBeInTheDocument()
    expect(screen.getByText(/Plan launch remotely/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(syncNow).toHaveBeenCalledOnce()
  })
})
