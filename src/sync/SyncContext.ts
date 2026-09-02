import { createContext } from 'react'
import type { ConflictResolutionAction, SyncConflictView } from './contracts'
import type { SyncState } from './engine/contracts'
import type { RealtimeConnectionState } from './realtime/contracts'

export interface SyncContextValue {
  state: SyncState
  conflicts: SyncConflictView[]
  realtimeState?: RealtimeConnectionState
  syncNow(): Promise<void>
  resolveConflict(
    conflictId: string,
    action: ConflictResolutionAction,
    focusTaskIds?: string[],
  ): Promise<void>
}

export const SyncContext = createContext<SyncContextValue | null>(null)
