import {
  Archive,
  CalendarDays,
  CheckSquare2,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  FolderKanban,
  Inbox,
  Settings,
  StickyNote,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ShellNavigationProps } from './types'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { usePreferencesStore } from '@/features/settings/preferences/preferencesStore'
import type { MessageKey } from '@/features/settings/language/messages'

interface NavigationItem {
  enabled: boolean
  icon: ComponentType<{ 'aria-hidden'?: boolean; size?: number }>
  labelKey: MessageKey
  view?: ShellNavigationProps['activeView']
}

const navigationItems: NavigationItem[] = [
  {
    enabled: true,
    icon: CalendarDays,
    labelKey: 'nav.today',
    view: 'foundation',
  },
  { enabled: false, icon: Inbox, labelKey: 'nav.inbox' },
  { enabled: false, icon: CheckSquare2, labelKey: 'nav.tasks' },
  { enabled: false, icon: Clock3, labelKey: 'nav.waiting' },
  { enabled: false, icon: StickyNote, labelKey: 'nav.notes' },
  { enabled: false, icon: FolderKanban, labelKey: 'nav.projects' },
  { enabled: false, icon: Archive, labelKey: 'nav.archive' },
  { enabled: true, icon: Settings, labelKey: 'nav.settings', view: 'settings' },
]

export function Sidebar({ activeView, onNavigate }: ShellNavigationProps) {
  const sidebarMode = usePreferencesStore((state) => state.sidebarMode)
  const setPreference = usePreferencesStore((state) => state.setPreference)
  const { t } = useTranslations()
  const isCollapsed = sidebarMode === 'collapsed'

  return (
    <aside className="app-sidebar">
      <button
        className="brand"
        type="button"
        aria-label={t('nav.home')}
        onClick={() => onNavigate('foundation')}
      >
        <span className="brand-mark">DW</span>
        <span className="sidebar-label">Daily Work OS</span>
      </button>

      <nav className="sidebar-navigation" aria-label={t('nav.primary')}>
        {navigationItems.map(({ enabled, icon: Icon, labelKey, view }) => {
          const label = t(labelKey)
          const isActive = view === activeView

          return (
            <button
              className="sidebar-link"
              data-active={isActive || undefined}
              disabled={!enabled}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              title={label}
              key={labelKey}
              onClick={() => view && onNavigate(view)}
            >
              <Icon aria-hidden={true} size={18} />
              <span className="sidebar-label">{label}</span>
            </button>
          )
        })}
      </nav>

      <button
        className="sidebar-toggle"
        type="button"
        aria-label={
          isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')
        }
        title={
          isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')
        }
        onClick={() =>
          setPreference('sidebarMode', isCollapsed ? 'expanded' : 'collapsed')
        }
      >
        {isCollapsed ? (
          <ChevronsRight aria-hidden="true" size={18} />
        ) : (
          <ChevronsLeft aria-hidden="true" size={18} />
        )}
        <span className="sidebar-label">
          {isCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
        </span>
      </button>
    </aside>
  )
}
