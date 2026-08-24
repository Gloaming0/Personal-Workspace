import { useState } from 'react'
import { FoundationPage } from './pages/FoundationPage'
import { AppShell } from './shell/AppShell'
import type { AppView } from './shell/types'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useTranslations } from '@/features/settings/language/useTranslations'

export function App() {
  const [activeView, setActiveView] = useState<AppView>('foundation')
  const { t } = useTranslations()

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      title={
        activeView === 'settings'
          ? t('shell.settingsTitle')
          : t('shell.foundationTitle')
      }
    >
      {activeView === 'settings' ? <SettingsPage /> : <FoundationPage />}
    </AppShell>
  )
}
