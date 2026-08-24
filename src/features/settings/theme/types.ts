export const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'minimal-light', label: 'Minimal Light' },
  { value: 'minimal-dark', label: 'Minimal Dark' },
  { value: 'warm-paper', label: 'Warm Paper' },
  { value: 'nordic-blue', label: 'Nordic Blue' },
  { value: 'sakura', label: 'Sakura' },
  { value: 'forest', label: 'Forest' },
] as const

export type Theme = (typeof themeOptions)[number]['value']
export type ResolvedTheme = Exclude<Theme, 'system'>
