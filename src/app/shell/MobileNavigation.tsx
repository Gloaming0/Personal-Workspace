import { CalendarDays, Inbox, MoreHorizontal, StickyNote } from 'lucide-react'
import type { ShellNavigationProps } from './types'
import { useTranslations } from '@/features/settings/language/useTranslations'

export function MobileNavigation({
  activeView,
  onNavigate,
}: ShellNavigationProps) {
  const { t } = useTranslations()

  return (
    <nav className="mobile-navigation" aria-label={t('nav.primary')}>
      <button
        type="button"
        data-active={activeView === 'today' || undefined}
        aria-current={activeView === 'today' ? 'page' : undefined}
        onClick={() => onNavigate('today')}
      >
        <CalendarDays aria-hidden="true" size={19} />
        <span>{t('nav.today')}</span>
      </button>
      <button type="button" disabled>
        <Inbox aria-hidden="true" size={19} />
        <span>{t('nav.inbox')}</span>
      </button>
      <button type="button" disabled>
        <StickyNote aria-hidden="true" size={19} />
        <span>{t('nav.notes')}</span>
      </button>
      <button
        type="button"
        data-active={activeView === 'settings' || undefined}
        aria-current={activeView === 'settings' ? 'page' : undefined}
        onClick={() => onNavigate('settings')}
      >
        <MoreHorizontal aria-hidden="true" size={19} />
        <span>{t('nav.more')}</span>
      </button>
    </nav>
  )
}
