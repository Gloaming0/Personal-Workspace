import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { getCloudRuntime, type CloudRuntime } from '@/cloud/cloudRuntime'
import type { BootstrapDiscoveryResult } from '@/features/bootstrap/contracts'
import type { BootstrapUiStage } from '@/features/bootstrap/BootstrapCoordinator'
import { BrowserBackupFileGateway } from '@/features/backup/BrowserBackupFileGateway'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { useAuth } from './useAuth'

export function AuthPanel({
  runtime = getCloudRuntime(),
  fileGateway = new BrowserBackupFileGateway(),
}: {
  runtime?: CloudRuntime
  fileGateway?: BrowserBackupFileGateway
}) {
  const { t } = useTranslations()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [discovery, setDiscovery] = useState<BootstrapDiscoveryResult | null>(
    null,
  )
  const [discoveryError, setDiscoveryError] = useState(false)
  const [bootstrapStage, setBootstrapStage] = useState<BootstrapUiStage | null>(
    null,
  )
  const [confirmation, setConfirmation] = useState<0 | 1 | 2>(0)
  const [busy, setBusy] = useState(false)
  const [showSetupGuide, setShowSetupGuide] = useState(false)

  const detect = useCallback(async () => {
    if (auth.status !== 'signed_in' || auth.identity.kind !== 'authenticated')
      return
    const coordinator = runtime.bootstrapCoordinator
    if (!coordinator) return
    setDiscoveryError(false)
    setBootstrapStage('detecting')
    try {
      await runtime.ready
      await coordinator.resume(auth.identity.userId)
      const result = await coordinator.inspect(auth.identity.userId)
      setDiscovery(result)
      setBootstrapStage('decision')
    } catch {
      setDiscoveryError(true)
      setBootstrapStage('error')
    }
  }, [auth.identity, auth.status, runtime])

  useEffect(() => {
    if (auth.status !== 'signed_in') return
    const timeout = window.setTimeout(() => void detect(), 0)
    return () => window.clearTimeout(timeout)
  }, [auth.status, detect])

  const runBootstrap = async (
    action: 'initialize' | 'connect' | 'restore' | 'use_cloud',
  ) => {
    if (auth.identity.kind !== 'authenticated') return
    const coordinator = runtime.bootstrapCoordinator
    if (!coordinator) return
    setBusy(true)
    setDiscoveryError(false)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    try {
      if (action === 'initialize') {
        setBootstrapStage('finalizing')
        await coordinator.initializeEmpty(auth.identity.userId)
      } else if (action === 'connect') {
        setBootstrapStage('safety_backup')
        await coordinator.connectLocalData(
          auth.identity.userId,
          timezone,
          fileGateway,
        )
      } else if (action === 'restore') {
        setBootstrapStage('downloading')
        await coordinator.restoreCloud(auth.identity.userId)
      } else {
        setBootstrapStage('safety_backup')
        await coordinator.useCloud(auth.identity.userId, timezone, fileGateway)
      }
      setBootstrapStage('complete')
      setConfirmation(0)
      await detect()
      await runtime.syncEngine?.sync({
        kind: 'authenticated',
        userId: auth.identity.userId,
      })
    } catch {
      setDiscoveryError(true)
      setBootstrapStage('error')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLinkSent(false)
    try {
      await auth.sendMagicLink(email.trim())
      setLinkSent(true)
    } catch {
      // AuthProvider owns the localized safe error state.
    }
  }

  if (!auth.configured) {
    return (
      <div className="auth-panel" role="status">
        <div>
          <strong>{t('auth.notConfiguredTitle')}</strong>
          <p>{t('auth.notConfiguredDescription')}</p>
        </div>
        <button
          className="secondary-button setup-guide-trigger"
          type="button"
          onClick={() => setShowSetupGuide((current) => !current)}
          aria-expanded={showSetupGuide}
        >
          {showSetupGuide
            ? t('auth.setupGuideClose')
            : t('auth.setupGuideAction')}
        </button>
        {showSetupGuide && (
          <article className="cloud-setup-guide">
            <header>
              <h3>{t('auth.setupGuideTitle')}</h3>
              <p>{t('auth.setupGuideIntro')}</p>
            </header>
            <ol>
              {(
                [
                  ['auth.setupGuideSupabase', 'auth.setupGuideSupabaseDetail'],
                  ['auth.setupGuideKeys', 'auth.setupGuideKeysDetail'],
                  ['auth.setupGuideEnv', 'auth.setupGuideEnvDetail'],
                  ['auth.setupGuideAuth', 'auth.setupGuideAuthDetail'],
                  ['auth.setupGuideVerify', 'auth.setupGuideVerifyDetail'],
                ] as const
              ).map(([title, detail]) => (
                <li key={title}>
                  <strong>{t(title)}</strong>
                  <p>{t(detail)}</p>
                </li>
              ))}
            </ol>
            <aside>
              <strong>{t('auth.setupGuideSecurity')}</strong>
              <p>{t('auth.setupGuideSecurityDetail')}</p>
            </aside>
          </article>
        )}
      </div>
    )
  }

  if (auth.status === 'restoring') {
    return (
      <div className="auth-panel" role="status">
        {t('auth.restoring')}
      </div>
    )
  }

  if (auth.status === 'signed_in') {
    return (
      <div className="auth-panel">
        <div>
          <strong>{t('auth.signedIn')}</strong>
          <p>
            {auth.identity.kind === 'authenticated' ? auth.identity.email : ''}
          </p>
        </div>
        {discovery ? (
          <div className="bootstrap-discovery" role="status">
            <strong>{t(`auth.bootstrap.${discovery.decision}`)}</strong>
            {bootstrapStage ? (
              <p>{t(`auth.bootstrapStage.${bootstrapStage}`)}</p>
            ) : null}
            {discovery.decision ===
            'already_bootstrapped' ? null : discovery.decision ===
              'initialize_authenticated_workspace' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBootstrap('initialize')}
              >
                {t('auth.bootstrap.initialize')}
              </button>
            ) : discovery.decision === 'connect_local_data' ? (
              confirmation === 0 ? (
                <button type="button" onClick={() => setConfirmation(1)}>
                  {t('auth.bootstrap.connect')}
                </button>
              ) : (
                <div className="bootstrap-confirmation" role="alert">
                  <p>{t('auth.bootstrap.confirmConnect')}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runBootstrap('connect')}
                  >
                    {t('auth.bootstrap.connect')}
                  </button>
                  <button type="button" onClick={() => setConfirmation(0)}>
                    {t('auth.bootstrap.cancel')}
                  </button>
                </div>
              )
            ) : discovery.decision === 'restore_cloud_data' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBootstrap('restore')}
              >
                {t('auth.bootstrap.restore')}
              </button>
            ) : confirmation < 2 ? (
              <div className="bootstrap-confirmation" role="alert">
                <p>{t('auth.bootstrap.confirmUseCloud')}</p>
                <button
                  type="button"
                  onClick={() => setConfirmation((confirmation + 1) as 1 | 2)}
                >
                  {confirmation === 0
                    ? t('auth.bootstrap.useCloud')
                    : t('auth.bootstrap.confirmAgain')}
                </button>
                <button type="button" onClick={() => setConfirmation(0)}>
                  {t('auth.bootstrap.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={() => void runBootstrap('use_cloud')}
              >
                {t('auth.bootstrap.confirmAgain')}
              </button>
            )}
          </div>
        ) : discoveryError ? (
          <div role="alert">
            <p>{t('auth.bootstrap.error')}</p>
            <button type="button" onClick={() => void detect()}>
              {t('auth.bootstrap.retry')}
            </button>
          </div>
        ) : (
          <p>{t('auth.discovering')}</p>
        )}
        <button
          className="secondary-button"
          type="button"
          onClick={auth.signOut}
        >
          {t('auth.signOut')}
        </button>
      </div>
    )
  }

  return (
    <form className="auth-panel" onSubmit={submit}>
      <div>
        <strong>{t('auth.magicLinkTitle')}</strong>
        <p>{t('auth.magicLinkDescription')}</p>
      </div>
      <label>
        <span>{t('auth.email')}</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button type="submit" disabled={auth.status === 'signing_in'}>
        {auth.status === 'signing_in'
          ? t('auth.sending')
          : t('auth.sendMagicLink')}
      </button>
      {linkSent ? <p role="status">{t('auth.linkSent')}</p> : null}
      {auth.status === 'error' ? <p role="alert">{t('auth.error')}</p> : null}
    </form>
  )
}
