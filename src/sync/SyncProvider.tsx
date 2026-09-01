import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { getCloudRuntime, type CloudRuntime } from '@/cloud/cloudRuntime'
import { useAuth } from '@/features/auth/useAuth'
import type { SyncConflictView } from './contracts'
import { SyncContext } from './SyncContext'
import type { SyncState } from './engine/contracts'

const unavailableState: SyncState = {
  status: 'idle',
  lastSuccessfulSyncAt: null,
  pendingMutationCount: 0,
  conflictCount: 0,
  safeErrorCode: null,
}

export function SyncProvider({
  children,
  runtime = getCloudRuntime(),
}: {
  children: ReactNode
  runtime?: CloudRuntime
}) {
  const auth = useAuth()
  const engine = runtime.syncEngine
  const state = useSyncExternalStore(
    engine?.status.subscribe ?? (() => () => undefined),
    engine?.status.getSnapshot ?? (() => unavailableState),
  )
  const [conflicts, setConflicts] = useState<SyncConflictView[]>([])

  const syncNow = useCallback(async () => {
    if (!engine || auth.identity.kind !== 'authenticated') return
    await runtime.ready
    const result = await engine.sync({
      kind: 'authenticated',
      userId: auth.identity.userId,
    })
    setConflicts(result.conflicts)
  }, [auth.identity, engine, runtime.ready])

  useEffect(() => {
    if (auth.status !== 'signed_in') return
    const timeout = window.setTimeout(() => void syncNow(), 0)
    return () => window.clearTimeout(timeout)
  }, [auth.status, syncNow])

  useEffect(() => {
    if (!engine || auth.identity.kind !== 'authenticated') return
    const trigger = () => void syncNow()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    window.addEventListener('online', trigger)
    window.addEventListener('focus', trigger)
    document.addEventListener('visibilitychange', onVisibility)
    const unsubscribe = runtime.localChanges?.subscribe(trigger)
    return () => {
      window.removeEventListener('online', trigger)
      window.removeEventListener('focus', trigger)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe?.()
    }
  }, [auth.identity, engine, runtime.localChanges, syncNow])

  const value = useMemo(
    () => ({ state, conflicts, syncNow }),
    [conflicts, state, syncNow],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
