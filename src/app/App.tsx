import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import type { AppView } from './shell/types'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { TodayDashboard } from '@/features/today/TodayDashboard'

export function App() {
  const [activeView, setActiveView] = useState<AppView>('today')
  const { t } = useTranslations()

  return (
    <AppShell
      activeView={activeView}
      onNavigate={setActiveView}
      title={
        activeView === 'settings'
          ? t('shell.settingsTitle')
          : t('shell.todayTitle')
      }
    >
      {activeView === 'settings' ? <SettingsPage /> : <TodayDashboard />}
    </AppShell>
  )
}
