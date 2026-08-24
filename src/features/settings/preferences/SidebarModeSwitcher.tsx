import { useTranslations } from '../language/useTranslations'
import { usePreferencesStore } from './preferencesStore'
import type { SidebarMode } from './types'

export function SidebarModeSwitcher() {
  const sidebarMode = usePreferencesStore((state) => state.sidebarMode)
  const setPreference = usePreferencesStore((state) => state.setPreference)
  const { t } = useTranslations()

  return (
    <select
      className="settings-select"
      aria-label={t('preferences.sidebarMode')}
      value={sidebarMode}
      onChange={(event) =>
        setPreference('sidebarMode', event.target.value as SidebarMode)
      }
    >
      <option value="expanded">{t('preferences.expanded')}</option>
      <option value="collapsed">{t('preferences.collapsed')}</option>
    </select>
  )
}
