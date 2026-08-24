export type AppView = 'today' | 'settings'

export interface ShellNavigationProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
}
