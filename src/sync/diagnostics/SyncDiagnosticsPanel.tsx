import { useState } from 'react'
import { getCloudRuntime } from '@/cloud/cloudRuntime'
import { useAuth } from '@/features/auth/useAuth'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { useOptionalSync } from '@/sync/useSync'
import type { SyncHealthDiagnostics } from './SyncDiagnosticsService'

export function SyncDiagnosticsPanel() {
  const { t } = useTranslations()
  const auth = useAuth()
  const sync = useOptionalSync()
  const service = getCloudRuntime().diagnostics
  const [report, setReport] = useState<SyncHealthDiagnostics | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'copied' | 'error'>(
    'idle',
  )

  if (!service || !sync) {
    return (
      <div className="sync-diagnostics">
        <p>{t('diagnostics.localOnly')}</p>
      </div>
    )
  }

  const collect = async () => {
    setStatus('loading')
    try {
      setReport(await service.collect(auth.identity.userId, sync.state))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  const copy = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="sync-diagnostics">
      <p>{t('diagnostics.description')}</p>
      <div className="settings-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={status === 'loading'}
          onClick={() => void collect()}
        >
          {status === 'loading'
            ? t('diagnostics.collecting')
            : t('diagnostics.collect')}
        </button>
        {report && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void copy()}
          >
            {status === 'copied'
              ? t('diagnostics.copied')
              : t('diagnostics.copy')}
          </button>
        )}
      </div>
      {status === 'error' && (
        <p className="form-error" role="alert">
          {t('diagnostics.error')}
        </p>
      )}
      {report && (
        <dl className="sync-diagnostics-grid">
          <div>
            <dt>{t('diagnostics.syncState')}</dt>
            <dd>{report.syncState}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.bootstrapState')}</dt>
            <dd>{report.bootstrapState}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.pending')}</dt>
            <dd>{report.pendingMutationCount}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.conflicts')}</dt>
            <dd>{report.conflictCount}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.cursor')}</dt>
            <dd>{report.currentCursor}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.integrity')}</dt>
            <dd>
              {report.integrity.ok
                ? t('diagnostics.integrityOk')
                : t('diagnostics.integrityIssues').replace(
                    '{count}',
                    String(report.integrity.issueCount),
                  )}
            </dd>
          </div>
          <div>
            <dt>{t('diagnostics.device')}</dt>
            <dd>{report.device}</dd>
          </div>
          <div>
            <dt>{t('diagnostics.database')}</dt>
            <dd>
              v{report.databaseVersion} · {report.databaseState}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}
