import { useContext } from 'react'
import { SyncContext } from './SyncContext'

export function useSync() {
  const value = useContext(SyncContext)
  if (!value) throw new Error('useSync must be used within SyncProvider.')
  return value
}

export function useOptionalSync() {
  return useContext(SyncContext)
}
