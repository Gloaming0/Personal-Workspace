import { useMemo, useState, type ChangeEvent } from 'react'
import { Download, ShieldCheck, Upload } from 'lucide-react'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { MessageKey } from '@/features/settings/language/messages'
import { BackupError, type BackupErrorCode } from './errors'
import type { BackupRuntime } from './backupRuntime'
import { getBackupRuntime } from './backupRuntime'
import { BrowserBackupFileGateway } from './BrowserBackupFileGateway'
import type { PreparedBackup } from './BackupService'
import {
  readLastSuccessfulExport,
  writeLastSuccessfulExport,
} from './exportHistoryStore'

interface BackupRestorePanelProps {
  runtime?: BackupRuntime
  fileGateway?: BrowserBackupFileGateway
  timezone?: string
  userId?: string
}

function errorMessageKey(code: BackupErrorCode) {
  if (code === 'wrong-owner') return 'backup.errorWrongOwner' as const
  if (code === 'unsupported-version')
    return 'backup.errorUnsupportedVersion' as const
  if (code === 'safety-backup-failed')
    return 'backup.errorSafetyBackup' as const
  if (code === 'restore-failed') return 'backup.errorRestore' as const
  if (code === 'export-failed') return 'backup.errorExport' as const
  return 'backup.errorInvalidFile' as const
}

export function BackupRestorePanel({
  runtime = getBackupRuntime(),
  fileGateway = new BrowserBackupFileGateway(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  userId = 'local-user',
}: BackupRestorePanelProps) {
  const { t } = useTranslations()
  const [lastExportedAt, setLastExportedAt] = useState(readLastSuccessfulExport)
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null)
  const [busy, setBusy] = useState<'export' | 'validate' | 'restore' | null>(
    null,
  )
  const [confirming, setConfirming] = useState(false)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [successKey, setSuccessKey] = useState<MessageKey | null>(null)

  const summaryRows = useMemo(
    () =>
      prepared
        ? ([
            ['backup.summaryTasks', prepared.summary.tasks],
            ['backup.summaryWaiting', prepared.summary.waiting],
            ['backup.summaryMemos', prepared.summary.memos],
            ['backup.summaryRoutines', prepared.summary.routines],
            ['backup.summaryRoutineLogs', prepared.summary.routineLogs],
            ['backup.summaryActivities', prepared.summary.activities],
            ['backup.summaryDailyLogs', prepared.summary.dailyLogs],
            ['backup.summaryTombstones', prepared.summary.tombstones],
          ] as const)
        : [],
    [prepared],
  )

  const showError = (
    caught: unknown,
    fallback: BackupErrorCode = 'invalid-structure',
  ) => {
    const code = caught instanceof BackupError ? caught.code : fallback
    setErrorKey(errorMessageKey(code))
  }

  const exportBackup = async () => {
    setBusy('export')
    setErrorKey(null)
    setSuccessKey(null)
    try {
      await runtime.ready
      const result = await runtime.service.createBackup(userId, timezone)
      fileGateway.download(result.json, result.filename)
      writeLastSuccessfulExport(result.backup.exportedAt)
      setLastExportedAt(result.backup.exportedAt)
      setSuccessKey('backup.exportSuccess')
    } catch {
      setErrorKey('backup.errorExport')
    } finally {
      setBusy(null)
    }
  }

  const selectBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy('validate')
    setErrorKey(null)
    setSuccessKey(null)
    setPrepared(null)
    setConfirming(false)
    try {
      await runtime.ready
      const json = await file.text()
      setPrepared(runtime.service.validateImport(json, userId))
    } catch (caught) {
      showError(caught)
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (!prepared) return
    setBusy('restore')
    setErrorKey(null)
    setSuccessKey(null)
    try {
      await runtime.service.restore(
        userId,
        prepared.backup,
        timezone,
        fileGateway,
      )
      setPrepared(null)
      setConfirming(false)
      setSuccessKey('backup.restoreSuccess')
    } catch (caught) {
      showError(caught, 'restore-failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="backup-restore-panel">
      <div className="backup-actions">
        <div>
          <h3>{t('backup.exportTitle')}</h3>
          <p>{t('backup.exportDescription')}</p>
          <small>
            {lastExportedAt
              ? `${t('backup.lastExport')}: ${new Intl.DateTimeFormat(
                  undefined,
                  { dateStyle: 'medium', timeStyle: 'short' },
                ).format(new Date(lastExportedAt))}`
              : t('backup.neverExported')}
          </small>
        </div>
        <button
          type="button"
          onClick={() => void exportBackup()}
          disabled={busy !== null}
        >
          <Download aria-hidden="true" size={17} />
          {busy === 'export' ? t('backup.exporting') : t('backup.exportAction')}
        </button>
      </div>

      <div className="backup-actions">
        <div>
          <h3>{t('backup.restoreTitle')}</h3>
          <p>{t('backup.restoreDescription')}</p>
        </div>
        <label className="button-like">
          <Upload aria-hidden="true" size={17} />
          {busy === 'validate'
            ? t('backup.validating')
            : t('backup.selectAction')}
          <input
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void selectBackup(event)}
            disabled={busy !== null}
          />
        </label>
      </div>

      {prepared && (
        <section className="backup-summary" aria-label={t('backup.summary')}>
          <div>
            <ShieldCheck aria-hidden="true" size={19} />
            <div>
              <h3>{t('backup.validTitle')}</h3>
              <p>{t('backup.validDescription')}</p>
            </div>
          </div>
          <dl>
            {summaryRows.map(([key, value]) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)}>
              {t('backup.restoreAction')}
            </button>
          ) : (
            <div className="backup-confirmation" role="alert">
              <strong>{t('backup.confirmTitle')}</strong>
              <p>{t('backup.confirmWarning')}</p>
              <div>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void restore()}
                  disabled={busy !== null}
                >
                  {busy === 'restore'
                    ? t('backup.restoring')
                    : t('backup.confirmAction')}
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  {t('backup.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {errorKey && <p role="alert">{t(errorKey)}</p>}
      {successKey && (
        <p className="backup-success" role="status">
          {t(successKey)}
        </p>
      )}
    </div>
  )
}
