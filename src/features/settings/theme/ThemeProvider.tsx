import { useEffect, type PropsWithChildren } from 'react'
import { useThemeStore } from './themeStore'
import type { ResolvedTheme, Theme } from './types'

const darkModeQuery = '(prefers-color-scheme: dark)'

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme
  return window.matchMedia(darkModeQuery).matches
    ? 'minimal-dark'
    : 'minimal-light'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    const mediaQuery = window.matchMedia(darkModeQuery)

    const applyTheme = () => {
      const resolvedTheme = resolveTheme(theme)
      document.documentElement.dataset.theme = resolvedTheme
      document.documentElement.style.colorScheme =
        resolvedTheme === 'minimal-dark' ? 'dark' : 'light'
    }

    applyTheme()
    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  return children
}
