import { PanelRightOpen } from 'lucide-react'
import { useState, type PropsWithChildren } from 'react'
import { MobileNavigation } from './MobileNavigation'
import { Sidebar } from './Sidebar'
import type { ShellNavigationProps } from './types'
import { UtilityPanel } from './UtilityPanel'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { usePreferencesStore } from '@/features/settings/preferences/preferencesStore'

interface AppShellProps extends PropsWithChildren, ShellNavigationProps {
  title: string
}

export function AppShell({
  activeView,
  children,
  onNavigate,
  title,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sidebarMode = usePreferencesStore((state) => state.sidebarMode)
  const { t } = useTranslations()

  return (
    <div className="app-shell" data-sidebar-mode={sidebarMode}>
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="app-workspace">
        <header className="app-header">
          <div>
            <p className="phase-label">Phase 2.3</p>
            <strong>{title}</strong>
          </div>
          <button
            className="icon-button utility-drawer-trigger"
            type="button"
            aria-label={t('shell.openUtilityPanel')}
            onClick={() => setDrawerOpen(true)}
          >
            <PanelRightOpen aria-hidden="true" size={19} />
          </button>
        </header>
        <div className="app-content">{children}</div>
      </div>
      <UtilityPanel
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />
      <MobileNavigation activeView={activeView} onNavigate={onNavigate} />
    </div>
  )
}
