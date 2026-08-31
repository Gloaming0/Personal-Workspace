import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AuthGateway, RuntimeIdentity } from './contracts'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

function gateway(identity: RuntimeIdentity | null = null): AuthGateway {
  return {
    restoreSession: vi.fn().mockResolvedValue(identity),
    sendMagicLink: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  }
}

function wrapper(authGateway: AuthGateway) {
  return ({ children }: { children: ReactNode }) => (
    <AuthProvider gateway={authGateway}>{children}</AuthProvider>
  )
}

describe('AuthProvider', () => {
  it('restores an authenticated session without changing local ownership', async () => {
    const authGateway = gateway({
      kind: 'authenticated',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'user@example.com',
    })
    const { result } = renderHook(useAuth, { wrapper: wrapper(authGateway) })

    await waitFor(() => expect(result.current.status).toBe('signed_in'))
    expect(result.current.identity).toMatchObject({
      kind: 'authenticated',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
  })

  it('signs out the cloud session while returning to local anonymous identity', async () => {
    const authGateway = gateway({
      kind: 'authenticated',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: null,
    })
    const { result } = renderHook(useAuth, { wrapper: wrapper(authGateway) })
    await waitFor(() => expect(result.current.status).toBe('signed_in'))

    await act(() => result.current.signOut())

    expect(authGateway.signOut).toHaveBeenCalledOnce()
    expect(result.current.identity).toEqual({
      kind: 'local-anonymous',
      userId: 'local-user',
    })
  })
})
