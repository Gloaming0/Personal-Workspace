import { createContext } from 'react'
import type { SyncConflictView } from './contracts'
import type { SyncState } from './engine/contracts'

export interface SyncContextValue {
  state: SyncState
  conflicts: SyncConflictView[]
  syncNow(): Promise<void>
}

export const SyncContext = createContext<SyncContextValue | null>(null)
