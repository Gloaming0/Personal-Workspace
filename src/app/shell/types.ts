export type AppView = 'foundation' | 'settings'

export interface ShellNavigationProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
}
