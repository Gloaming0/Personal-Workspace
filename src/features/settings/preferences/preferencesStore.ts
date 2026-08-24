import { create } from 'zustand'
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware'
import { supportedLanguages } from '../language/types'
import { themeOptions } from '../theme/types'
import {
  densityOptions,
  quickCaptureDefaultOptions,
  sidebarModeOptions,
  weekStartsOnOptions,
  type UserPreferences,
} from './types'

interface PreferencesState extends UserPreferences {
  setPreference: <Key extends keyof UserPreferences>(
    key: Key,
    value: UserPreferences[Key],
  ) => void
}

function getDefaultLanguage(): UserPreferences['language'] {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export const preferencesStorageKey = 'daily-work-os:preferences'
export const legacyPreferencesStorageKey = 'daily-work-os:appearance'
export const preferencesStorageVersion = 1

export function getDefaultPreferences(): UserPreferences {
  return {
    density: 'comfortable',
    language: getDefaultLanguage(),
    quickCaptureDefault: 'inbox',
    sidebarMode: 'expanded',
    theme: 'system',
    weekStartsOn: 1,
  }
}

function includes<Value>(
  values: readonly Value[],
  value: unknown,
): value is Value {
  return values.includes(value as Value)
}

export function sanitizePreferences(
  value: unknown,
  fallback = getDefaultPreferences(),
): UserPreferences {
  const candidate =
    typeof value === 'object' && value !== null
      ? (value as Partial<UserPreferences>)
      : {}
  const themes = themeOptions.map((option) => option.value)

  return {
    density: includes(densityOptions, candidate.density)
      ? candidate.density
      : fallback.density,
    language: includes(supportedLanguages, candidate.language)
      ? candidate.language
      : fallback.language,
    quickCaptureDefault: includes(
      quickCaptureDefaultOptions,
      candidate.quickCaptureDefault,
    )
      ? candidate.quickCaptureDefault
      : fallback.quickCaptureDefault,
    sidebarMode: includes(sidebarModeOptions, candidate.sidebarMode)
      ? candidate.sidebarMode
      : fallback.sidebarMode,
    theme: includes(themes, candidate.theme) ? candidate.theme : fallback.theme,
    weekStartsOn: includes(weekStartsOnOptions, candidate.weekStartsOn)
      ? candidate.weekStartsOn
      : fallback.weekStartsOn,
  }
}

const storage: StateStorage = {
  getItem: (name) => {
    const current = window.localStorage.getItem(name)
    if (current !== null || name !== preferencesStorageKey) return current
    return window.localStorage.getItem(legacyPreferencesStorageKey)
  },
  removeItem: (name) => window.localStorage.removeItem(name),
  setItem: (name, value) => window.localStorage.setItem(name, value),
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...getDefaultPreferences(),
      setPreference: (key, value) => set({ [key]: value }),
    }),
    {
      name: preferencesStorageKey,
      version: preferencesStorageVersion,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        density: state.density,
        language: state.language,
        quickCaptureDefault: state.quickCaptureDefault,
        sidebarMode: state.sidebarMode,
        theme: state.theme,
        weekStartsOn: state.weekStartsOn,
      }),
      migrate: (persistedState) => sanitizePreferences(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePreferences(persistedState, currentState),
      }),
    },
  ),
)
