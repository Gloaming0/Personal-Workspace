import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { lazy, Suspense } from 'react'
import { useAuth } from '@/features/auth/useAuth'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { useOptionalSync } from './useSync'

const ConflictCenter = lazy(() =>
  import('./ConflictCenter').then((module) => ({
    default: module.ConflictCenter,
  })),
)

export function SyncStatusIndicator() {
  const auth = useAuth()
  const { t } = useTranslations()
  const sync = useOptionalSync()
  const [expanded, setExpanded] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  if (auth.identity.kind !== 'authenticated' || !sync) return null
  const { state, conflicts, syncNow, resolveConflict } = sync

  const label =
    state.status === 'syncing'
      ? t('sync.syncing')
      : state.status === 'offline'
        ? t('sync.offline')
        : state.status === 'auth_required'
          ? t('sync.authRequired')
          : state.status === 'blocked'
            ? t('sync.blocked')
            : state.status === 'error'
              ? t('sync.error')
              : state.conflictCount > 0
                ? t('sync.conflicts').replace(
                    '{count}',
                    String(state.conflictCount),
                  )
                : state.pendingMutationCount > 0
                  ? t('sync.pending').replace(
                      '{count}',
                      String(state.pendingMutationCount),
                    )
                  : t('sync.synced')
  const Icon =
    state.conflictCount > 0
      ? TriangleAlert
      : state.status === 'offline'
        ? CloudOff
        : state.status === 'syncing'
          ? RefreshCw
          : Cloud

  return (
    <div className="sync-status">
      <button
        className="sync-status-button"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <Icon aria-hidden="true" size={15} />
        <span>{label}</span>
      </button>
      {expanded && (
        <div className="sync-status-popover">
          <p>{label}</p>
          {state.lastSuccessfulSyncAt && (
            <small>
              {t('sync.lastSync')}:{' '}
              {new Date(state.lastSuccessfulSyncAt).toLocaleString()}
            </small>
          )}
          {conflicts.length > 0 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowConflicts(true)}
            >
              {t('sync.reviewConflicts')}
            </button>
          )}
          <button
            className="secondary-button"
            type="button"
            disabled={state.status === 'syncing'}
            onClick={() => void syncNow()}
          >
            {t('sync.now')}
          </button>
        </div>
      )}
      {showConflicts && (
        <Suspense fallback={null}>
          <ConflictCenter
            conflicts={conflicts}
            onClose={() => setShowConflicts(false)}
            onResolve={resolveConflict}
          />
        </Suspense>
      )}
    </div>
  )
}
