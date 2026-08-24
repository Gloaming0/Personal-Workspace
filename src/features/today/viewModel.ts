import type { TaskPriority, TaskStatus } from '@/domain/entities'
import type { Instant, LocalDate } from '@/domain/shared'

export type TodayWidgetStatus = 'loading' | 'ready' | 'empty'

export interface TodayFocusItemViewModel {
  taskId: string
  title: string
  projectName: string | null
  plannedAt: Instant | null
  focusOrder: 1 | 2 | 3
}

export interface TodayTaskItemViewModel {
  taskId: string
  title: string
  projectName: string | null
  plannedAt: Instant | null
  priority: TaskPriority
  status: TaskStatus
}

export interface TodayWaitingItemViewModel {
  waitingId: string
  title: string
  person: string | null
  followUpDate: LocalDate | null
  daysWaiting: number
  needsFollowUp: boolean
}

export interface TodayCheckInItemViewModel {
  routineId: string
  routineLogId: string | null
  title: string
  completed: boolean
}

export interface TodayQuickMemoViewModel {
  memoId: string
  content: string
  updatedAt: Instant
}

export type TodayActivityKind =
  'task_completed' | 'memo_updated' | 'waiting_created'

export interface TodayActivityItemViewModel {
  activityId: string
  kind: TodayActivityKind
  entityTitle: string
  occurredAt: Instant
}

export interface TodayDashboardViewModel {
  date: LocalDate
  summary: {
    openTaskCount: number
    waitingCount: number
    completedCheckInCount: number
    totalCheckInCount: number
  }
  focus: TodayFocusItemViewModel[]
  tasks: TodayTaskItemViewModel[]
  waiting: TodayWaitingItemViewModel[]
  checkIns: TodayCheckInItemViewModel[]
  quickMemo: TodayQuickMemoViewModel | null
  recentActivity: TodayActivityItemViewModel[]
}
