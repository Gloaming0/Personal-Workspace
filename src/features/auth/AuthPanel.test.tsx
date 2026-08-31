import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudRuntime } from '@/cloud/cloudRuntime'
import { AuthProvider } from './AuthProvider'
import type { AuthGateway } from './contracts'
import { AuthPanel } from './AuthPanel'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function authGateway(): AuthGateway {
  return {
    restoreSession: vi.fn(async () => ({
      kind: 'authenticated' as const,
      userId: USER,
      email: 'user@example.test',
    })),
    sendMagicLink: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  }
}

function runtime(decision: string) {
  const coordinator = {
    resume: vi.fn(async () => undefined),
    inspect: vi.fn(async () => ({
      local: decision === 'restore_cloud_data' ? 'empty' : 'has_data',
      cloud: decision === 'connect_local_data' ? 'empty' : 'has_data',
      syncBootstrapState: 'requires_bootstrap',
      decision,
    })),
    initializeEmpty: vi.fn(async () => undefined),
    connectLocalData: vi.fn(async () => undefined),
    restoreCloud: vi.fn(async () => undefined),
    useCloud: vi.fn(async () => undefined),
  }
  return {
    configured: true,
    authGateway: null,
    cloudPort: null,
    bootstrapDiscovery: null,
    bootstrapCoordinator: coordinator,
    ready: Promise.resolve(),
  } as unknown as CloudRuntime & { bootstrapCoordinator: typeof coordinator }
}

describe('Bootstrap account UX', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('requires confirmation before connecting local data on desktop', async () => {
    const user = userEvent.setup()
    const cloud = runtime('connect_local_data')
    render(
      <AuthProvider gateway={authGateway()}>
        <AuthPanel runtime={cloud} fileGateway={{} as never} />
      </AuthProvider>,
    )

    await screen.findByText('Connect this device’s local data to the account.')
    await user.click(screen.getByRole('button', { name: 'Connect local data' }))
    expect(
      screen.getByText(
        'A safety backup will be downloaded before this device is connected.',
      ),
    ).toBeInTheDocument()
    expect(cloud.bootstrapCoordinator.connectLocalData).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Connect local data' }))
    await waitFor(() =>
      expect(
        cloud.bootstrapCoordinator.connectLocalData,
      ).toHaveBeenCalledOnce(),
    )
  })

  it('requires a second confirmation for Use Cloud and remains touch-accessible on mobile', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 390,
      configurable: true,
    })
    const user = userEvent.setup()
    const cloud = runtime('manual_choice_required')
    render(
      <AuthProvider gateway={authGateway()}>
        <AuthPanel runtime={cloud} fileGateway={{} as never} />
      </AuthProvider>,
    )

    await screen.findByText(
      'Both sides contain data. Choose explicitly before continuing.',
    )
    await user.click(screen.getByRole('button', { name: 'Use cloud data' }))
    expect(cloud.bootstrapCoordinator.useCloud).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirm use cloud data' }),
    )
    expect(cloud.bootstrapCoordinator.useCloud).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', { name: 'Confirm use cloud data' }),
    )
    await waitFor(() =>
      expect(cloud.bootstrapCoordinator.useCloud).toHaveBeenCalledOnce(),
    )
  })
})
