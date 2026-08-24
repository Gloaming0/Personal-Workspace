import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import type { AppView } from './shell/types'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useTranslations } from '@/features/settings/language/useTranslations'
import {
  TaskTodayWorkspace,
  TodayWorkspaceProvider,
} from '@/features/today/TaskTodayWorkspace'

export function App() {
  const [activeView, setActiveView] = useState<AppView>('today')
  const { t } = useTranslations()

  return (
    <TodayWorkspaceProvider>
      <AppShell
        activeView={activeView}
        onNavigate={setActiveView}
        title={
          activeView === 'settings'
            ? t('shell.settingsTitle')
            : t('shell.todayTitle')
        }
      >
        {activeView === 'settings' ? <SettingsPage /> : <TaskTodayWorkspace />}
      </AppShell>
    </TodayWorkspaceProvider>
  )
}
