import { Palette } from 'lucide-react'
import { useTranslations } from '../language/useTranslations'
import { usePreferencesStore } from '../preferences/preferencesStore'
import { themeOptions, type Theme } from './types'

const themeMessageKeys = {
  system: 'theme.system',
  'minimal-light': 'theme.minimalLight',
  'minimal-dark': 'theme.minimalDark',
  'warm-paper': 'theme.warmPaper',
  'nordic-blue': 'theme.nordicBlue',
  sakura: 'theme.sakura',
  forest: 'theme.forest',
} as const

export function ThemeSwitcher() {
  const theme = usePreferencesStore((state) => state.theme)
  const setTheme = usePreferencesStore((state) => state.setTheme)
  const { t } = useTranslations()

  return (
    <label className="preference-switcher">
      <span className="sr-only">{t('preferences.theme')}</span>
      <Palette aria-hidden="true" size={16} />
      <select
        aria-label={t('preferences.theme')}
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(themeMessageKeys[option.value])}
          </option>
        ))}
      </select>
    </label>
  )
}
