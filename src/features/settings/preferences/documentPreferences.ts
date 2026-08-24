import type { Language } from '../language/types'
import type { ResolvedTheme, Theme } from '../theme/types'
import type { Density } from './types'

export const darkModeQuery = '(prefers-color-scheme: dark)'

export interface DocumentPreferences {
  density: Density
  language: Language
  theme: Theme
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme
  return window.matchMedia(darkModeQuery).matches
    ? 'minimal-dark'
    : 'minimal-light'
}

function updateThemeColor() {
  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-primary')
    .trim()
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  if (themeColor && meta) meta.content = themeColor
}

export function applyDocumentPreferences({
  density,
  language,
  theme,
}: DocumentPreferences) {
  const resolvedTheme = resolveTheme(theme)
  document.documentElement.dataset.density = density
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.lang = language
  document.documentElement.style.colorScheme =
    resolvedTheme === 'minimal-dark' ? 'dark' : 'light'
  requestAnimationFrame(updateThemeColor)
}
