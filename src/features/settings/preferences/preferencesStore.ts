import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '../language/types'
import type { Theme } from '../theme/types'

interface PreferencesState {
  language: Language
  theme: Theme
  setLanguage: (language: Language) => void
  setTheme: (theme: Theme) => void
}

function getDefaultLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export const preferencesStorageKey = 'daily-work-os:appearance'

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      language: getDefaultLanguage(),
      theme: 'system',
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: preferencesStorageKey },
  ),
)
