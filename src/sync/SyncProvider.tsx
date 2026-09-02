import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useRef,
  type ReactNode,
} from 'react'
import { getCloudRuntime, type CloudRuntime } from '@/cloud/cloudRuntime'
import { useAuth } from '@/features/auth/useAuth'
import type {
  ConflictResolutionAction,
  ConflictResolutionCommand,
  SyncConflictView,
} from './contracts'
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
  const rawState = useSyncExternalStore(
    engine?.status.subscribe ?? (() => () => undefined),
    engine?.status.getSnapshot ?? (() => unavailableState),
  )
  const realtimeState = useSyncExternalStore(
    runtime.realtimeCoordinator?.subscribeState ?? (() => () => undefined),
    runtime.realtimeCoordinator?.getState ?? (() => 'idle' as const),
  )
  const [syncOwner, setSyncOwner] = useState<string | null>(null)
  const [conflictOwner, setConflictOwner] = useState<string | null>(null)
  const [storedConflicts, setStoredConflicts] = useState<SyncConflictView[]>([])
  const resolutionRetries = useRef(new Map<string, ConflictResolutionCommand>())
  const syncEpoch = useRef(0)
  const currentUserId =
    auth.identity.kind === 'authenticated' ? auth.identity.userId : null
  const state = syncOwner === currentUserId ? rawState : unavailableState
  const conflicts = useMemo(
    () => (conflictOwner === currentUserId ? storedConflicts : []),
    [conflictOwner, currentUserId, storedConflicts],
  )

  const syncNow = useCallback(async () => {
    if (!engine || auth.identity.kind !== 'authenticated') return
    const userId = auth.identity.userId
    const epoch = syncEpoch.current
    await runtime.ready
    const result = await engine.sync({
      kind: 'authenticated',
      userId,
    })
    if (syncEpoch.current !== epoch) return
    setSyncOwner(userId)
    setConflictOwner(userId)
    setStoredConflicts(result.conflicts)
    await runtime.realtimeCoordinator?.start(userId)
  }, [auth.identity, engine, runtime.ready, runtime.realtimeCoordinator])

  const resolveConflict = useCallback(
    async (
      conflictId: string,
      action: ConflictResolutionAction,
      focusTaskIds?: string[],
    ) => {
      if (!runtime.conflictResolution || auth.identity.kind !== 'authenticated')
        return
      const userId = auth.identity.userId
      const needsMutation = ![
        'use_remote',
        'restore_remote',
        'keep_remote_daily_log',
        'keep_remote_routine_log',
        'keep_local_daily_log',
      ].includes(action)
      const existing = resolutionRetries.current.get(conflictId)
      const command =
        existing?.action === action
          ? existing
          : {
              resolutionId: crypto.randomUUID(),
              mutationId: needsMutation ? crypto.randomUUID() : null,
              userId,
              conflictId,
              action,
              focusTaskIds,
            }
      resolutionRetries.current.set(conflictId, command)
      await runtime.conflictResolution.resolve(command)
      resolutionRetries.current.delete(conflictId)
      await syncNow()
    },
    [auth.identity, runtime.conflictResolution, syncNow],
  )

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

  useEffect(() => {
    syncEpoch.current += 1
    resolutionRetries.current.clear()
    runtime.realtimeCoordinator?.stop()
    return () => {
      syncEpoch.current += 1
      runtime.realtimeCoordinator?.stop()
    }
  }, [currentUserId, runtime.realtimeCoordinator])

  useEffect(() => {
    if (!currentUserId) return
    return runtime.realtimeCoordinator?.subscribeResults((result) => {
      setSyncOwner(currentUserId)
      setConflictOwner(currentUserId)
      setStoredConflicts(result.conflicts)
    })
  }, [currentUserId, runtime.realtimeCoordinator])

  const value = useMemo(
    () => ({ state, conflicts, realtimeState, syncNow, resolveConflict }),
    [conflicts, realtimeState, resolveConflict, state, syncNow],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
