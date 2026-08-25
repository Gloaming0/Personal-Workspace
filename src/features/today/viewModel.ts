import type { TaskPriority, TaskStatus, WaitingStatus } from '@/domain/entities'
import type { ActivityEntityType, Instant, LocalDate } from '@/domain/shared'

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
  focusOrder: 1 | 2 | 3 | null
}

export interface TodayWaitingItemViewModel {
  waitingId: string
  title: string
  person: string | null
  notes: string | null
  status: WaitingStatus
  projectName: string | null
  sourceTaskId: string | null
  followUpDate: LocalDate | null
  daysWaiting: number
  needsFollowUp: boolean
}

export interface TodayCheckInItemViewModel {
  routineId: string
  routineLogId: string | null
  date: LocalDate
  title: string
  completed: boolean
}

export interface TodayQuickMemoViewModel {
  memoId: string
  content: string
  pinned: boolean
  projectId: string | null
  projectName: string | null
  updatedAt: Instant
}

export interface TodayActivityItemViewModel {
  activityId: string
  entityType: ActivityEntityType
  text: string
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
