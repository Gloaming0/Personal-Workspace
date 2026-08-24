import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from './types'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'daily-work-os:appearance' },
  ),
)
