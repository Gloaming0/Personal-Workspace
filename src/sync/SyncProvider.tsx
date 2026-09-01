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
  const state = useSyncExternalStore(
    engine?.status.subscribe ?? (() => () => undefined),
    engine?.status.getSnapshot ?? (() => unavailableState),
  )
  const [conflicts, setConflicts] = useState<SyncConflictView[]>([])
  const resolutionRetries = useRef(new Map<string, ConflictResolutionCommand>())

  const syncNow = useCallback(async () => {
    if (!engine || auth.identity.kind !== 'authenticated') return
    await runtime.ready
    const result = await engine.sync({
      kind: 'authenticated',
      userId: auth.identity.userId,
    })
    setConflicts(result.conflicts)
    await runtime.realtimeCoordinator?.start(auth.identity.userId)
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
    if (auth.identity.kind === 'authenticated') return
    runtime.realtimeCoordinator?.stop()
  }, [auth.identity, runtime.realtimeCoordinator])

  useEffect(
    () =>
      runtime.realtimeCoordinator?.subscribeResults((result) =>
        setConflicts(result.conflicts),
      ),
    [runtime.realtimeCoordinator],
  )

  const value = useMemo(
    () => ({ state, conflicts, syncNow, resolveConflict }),
    [conflicts, resolveConflict, state, syncNow],
  )
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}
