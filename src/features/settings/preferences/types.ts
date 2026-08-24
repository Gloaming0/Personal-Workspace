import type { Language } from '../language/types'
import type { Theme } from '../theme/types'

export const densityOptions = ['comfortable', 'compact'] as const
export const sidebarModeOptions = ['expanded', 'collapsed'] as const
export const quickCaptureDefaultOptions = [
  'inbox',
  'task',
  'waiting',
  'memo',
] as const
export const weekStartsOnOptions = [0, 1] as const

export type Density = (typeof densityOptions)[number]
export type SidebarMode = (typeof sidebarModeOptions)[number]
export type QuickCaptureDefault = (typeof quickCaptureDefaultOptions)[number]
export type WeekStartsOn = (typeof weekStartsOnOptions)[number]

export interface UserPreferences {
  density: Density
  language: Language
  quickCaptureDefault: QuickCaptureDefault
  sidebarMode: SidebarMode
  theme: Theme
  weekStartsOn: WeekStartsOn
}
