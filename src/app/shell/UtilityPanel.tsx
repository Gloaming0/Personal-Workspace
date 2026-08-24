import { Check, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface UtilityPanelProps {
  drawerOpen: boolean
  onCloseDrawer: () => void
}

function UtilityContent() {
  const { t } = useTranslations()

  return (
    <>
      <div className="utility-panel-heading">
        <div>
          <p className="section-label">Phase 0.5</p>
          <h2>{t('shell.utilityTitle')}</h2>
        </div>
      </div>
      <p className="utility-panel-description">
        {t('shell.utilityDescription')}
      </p>
      <dl className="utility-status-list">
        <div>
          <dt>
            <Check aria-hidden="true" size={15} />
            {t('shell.utilityResponsive')}
          </dt>
          <dd>{t('shell.utilityResponsiveValue')}</dd>
        </div>
        <div>
          <dt>
            <Check aria-hidden="true" size={15} />
            {t('shell.utilityPreferences')}
          </dt>
          <dd>{t('shell.utilityPreferencesValue')}</dd>
        </div>
      </dl>
    </>
  )
}

export function UtilityPanel({ drawerOpen, onCloseDrawer }: UtilityPanelProps) {
  const { t } = useTranslations()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!drawerOpen) return

    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseDrawer()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [drawerOpen, onCloseDrawer])

  return (
    <>
      <aside className="utility-panel" aria-label={t('shell.utilityTitle')}>
        <UtilityContent />
      </aside>
      {drawerOpen && (
        <div className="utility-drawer-layer">
          <button
            className="utility-drawer-backdrop"
            type="button"
            aria-label={t('shell.closeUtilityPanel')}
            onClick={onCloseDrawer}
          />
          <aside
            className="utility-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('shell.utilityTitle')}
          >
            <button
              ref={closeButtonRef}
              className="icon-button utility-drawer-close"
              type="button"
              aria-label={t('shell.closeUtilityPanel')}
              onClick={onCloseDrawer}
            >
              <X aria-hidden="true" size={18} />
            </button>
            <UtilityContent />
          </aside>
        </div>
      )}
    </>
  )
}
