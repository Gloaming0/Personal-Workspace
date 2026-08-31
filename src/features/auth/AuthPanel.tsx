import { useEffect, useState, type FormEvent } from 'react'
import { getCloudRuntime } from '@/cloud/cloudRuntime'
import type { BootstrapDiscoveryResult } from '@/features/bootstrap/contracts'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { useAuth } from './useAuth'

export function AuthPanel() {
  const { t } = useTranslations()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const [discovery, setDiscovery] = useState<BootstrapDiscoveryResult | null>(
    null,
  )
  const [discoveryError, setDiscoveryError] = useState(false)

  useEffect(() => {
    if (auth.status !== 'signed_in') return
    const service = getCloudRuntime().bootstrapDiscovery
    if (!service) return
    let active = true
    void service
      .inspect()
      .then((result) => {
        if (active) setDiscovery(result)
      })
      .catch(() => {
        if (active) setDiscoveryError(true)
      })
    return () => {
      active = false
    }
  }, [auth.status])

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
        <strong>{t('auth.notConfiguredTitle')}</strong>
        <p>{t('auth.notConfiguredDescription')}</p>
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
            <p>{t('auth.bootstrapNoAutomaticChange')}</p>
          </div>
        ) : discoveryError ? (
          <p role="alert">{t('auth.discoveryError')}</p>
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
