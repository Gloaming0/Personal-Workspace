import { useTranslations } from '../language/useTranslations'
import { usePreferencesStore } from './preferencesStore'
import type { Density } from './types'

export function DensitySwitcher() {
  const density = usePreferencesStore((state) => state.density)
  const setPreference = usePreferencesStore((state) => state.setPreference)
  const { t } = useTranslations()

  return (
    <select
      className="settings-select"
      aria-label={t('preferences.density')}
      value={density}
      onChange={(event) =>
        setPreference('density', event.target.value as Density)
      }
    >
      <option value="comfortable">{t('preferences.comfortable')}</option>
      <option value="compact">{t('preferences.compact')}</option>
    </select>
  )
}
