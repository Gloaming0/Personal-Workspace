import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { applyDocumentPreferences } from '@/features/settings/preferences/documentPreferences'
import { PreferencesProvider } from '@/features/settings/preferences/PreferencesProvider'
import { usePreferencesStore } from '@/features/settings/preferences/preferencesStore'
import '@/styles/index.css'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { getCloudRuntime } from '@/cloud/cloudRuntime'
import { SyncProvider } from '@/sync/SyncProvider'

applyDocumentPreferences(usePreferencesStore.getState())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <AuthProvider gateway={getCloudRuntime().authGateway}>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AuthProvider>
    </PreferencesProvider>
  </StrictMode>,
)
