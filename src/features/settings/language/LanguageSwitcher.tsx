import { Languages } from 'lucide-react'
import { usePreferencesStore } from '../preferences/preferencesStore'
import { useTranslations } from './useTranslations'
import type { Language } from './types'

const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
] as const

export function LanguageSwitcher() {
  const language = usePreferencesStore((state) => state.language)
  const setPreference = usePreferencesStore((state) => state.setPreference)
  const { t } = useTranslations()

  return (
    <label className="preference-switcher">
      <span className="sr-only">{t('preferences.language')}</span>
      <Languages aria-hidden="true" size={16} />
      <select
        aria-label={t('preferences.language')}
        value={language}
        onChange={(event) =>
          setPreference('language', event.target.value as Language)
        }
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
