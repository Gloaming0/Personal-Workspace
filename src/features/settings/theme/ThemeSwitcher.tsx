import { Palette } from 'lucide-react'
import { themeOptions, type Theme } from './types'
import { useThemeStore } from './themeStore'

export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)

  return (
    <label className="theme-switcher">
      <span className="sr-only">Theme</span>
      <Palette aria-hidden="true" size={16} />
      <select
        aria-label="Theme"
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
