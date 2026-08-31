import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthGateway, AuthSnapshot } from './contracts'
import { AuthContext, type AuthContextValue } from './AuthContext'

const anonymousIdentity = {
  kind: 'local-anonymous' as const,
  userId: 'local-user' as const,
}

export function AuthProvider({
  gateway,
  children,
}: {
  gateway: AuthGateway | null
  children: ReactNode
}) {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>({
    status: gateway ? 'restoring' : 'signed_out',
    identity: anonymousIdentity,
    errorCode: null,
  })

  const restore = useCallback(async () => {
    if (!gateway) return
    setSnapshot((current) => ({ ...current, status: 'restoring' }))
    try {
      const identity = await gateway.restoreSession()
      setSnapshot({
        status: identity ? 'signed_in' : 'signed_out',
        identity: identity ?? anonymousIdentity,
        errorCode: null,
      })
    } catch {
      setSnapshot({
        status: 'error',
        identity: anonymousIdentity,
        errorCode: 'session_restore_failed',
      })
    }
  }, [gateway])

  useEffect(() => {
    if (!gateway) return
    let active = true
    void gateway
      .restoreSession()
      .then((identity) => {
        if (!active) return
        setSnapshot({
          status: identity ? 'signed_in' : 'signed_out',
          identity: identity ?? anonymousIdentity,
          errorCode: null,
        })
      })
      .catch(() => {
        if (!active) return
        setSnapshot({
          status: 'error',
          identity: anonymousIdentity,
          errorCode: 'session_restore_failed',
        })
      })
    const unsubscribe = gateway.subscribe((identity) => {
      setSnapshot({
        status: identity ? 'signed_in' : 'signed_out',
        identity: identity ?? anonymousIdentity,
        errorCode: null,
      })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [gateway])

  const sendMagicLink = useCallback(
    async (email: string) => {
      if (!gateway) throw new Error('Supabase is not configured.')
      setSnapshot((current) => ({ ...current, status: 'signing_in' }))
      try {
        await gateway.sendMagicLink(email)
        setSnapshot((current) => ({
          ...current,
          status: 'signed_out',
          errorCode: null,
        }))
      } catch (error) {
        setSnapshot((current) => ({
          ...current,
          status: 'error',
          errorCode: 'magic_link_failed',
        }))
        throw error
      }
    },
    [gateway],
  )

  const signOut = useCallback(async () => {
    if (!gateway) return
    try {
      await gateway.signOut()
      setSnapshot({
        status: 'signed_out',
        identity: anonymousIdentity,
        errorCode: null,
      })
    } catch {
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        errorCode: 'sign_out_failed',
      }))
    }
  }, [gateway])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      configured: gateway !== null,
      sendMagicLink,
      signOut,
      retrySessionRestore: restore,
    }),
    [gateway, restore, sendMagicLink, signOut, snapshot],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
