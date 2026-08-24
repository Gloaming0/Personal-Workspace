import type { Language } from '@/features/settings/language/types'

export type DashboardStatus = 'loading' | 'ready' | 'empty'
export type LocalizedText = Record<Language, string>

export interface FocusItem {
  id: string
  title: LocalizedText
  context: LocalizedText
}

export interface TodayTask {
  id: string
  title: LocalizedText
  project: LocalizedText
  time: string
  priority: 'high' | 'normal'
  completed: boolean
}

export interface WaitingItem {
  id: string
  title: LocalizedText
  person: LocalizedText
  followUp: LocalizedText
}

export interface DailyCheckIn {
  id: string
  title: LocalizedText
  completed: boolean
}

export interface QuickMemo {
  id: string
  content: LocalizedText
  updatedAt: LocalizedText
}

export interface RecentActivity {
  id: string
  kind: 'task' | 'waiting' | 'memo'
  description: LocalizedText
  occurredAt: LocalizedText
}

export interface TodayDashboardData {
  focus: FocusItem[]
  tasks: TodayTask[]
  waiting: WaitingItem[]
  checkIns: DailyCheckIn[]
  memo: QuickMemo | null
  activity: RecentActivity[]
}

export function localize(text: LocalizedText, language: Language) {
  return text[language]
}
