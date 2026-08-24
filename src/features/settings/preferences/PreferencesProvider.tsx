import { useEffect, type PropsWithChildren } from 'react'
import { usePreferencesStore } from './preferencesStore'
import { applyDocumentPreferences, darkModeQuery } from './documentPreferences'

export function PreferencesProvider({ children }: PropsWithChildren) {
  const density = usePreferencesStore((state) => state.density)
  const language = usePreferencesStore((state) => state.language)
  const theme = usePreferencesStore((state) => state.theme)

  useEffect(() => {
    const mediaQuery = window.matchMedia(darkModeQuery)
    const applyPreferences = () =>
      applyDocumentPreferences({ density, language, theme })

    applyPreferences()
    mediaQuery.addEventListener('change', applyPreferences)
    return () => mediaQuery.removeEventListener('change', applyPreferences)
  }, [density, language, theme])

  return children
}
